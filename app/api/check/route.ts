import { NextRequest, NextResponse } from "next/server";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";
export type Protocol = "x402" | "L402" | "unknown";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  data?: unknown;
}

export interface CheckResponse {
  url: string;
  protocol: Protocol;
  checks: CheckResult[];
  testedAt: string;
}

async function safeFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<{ res: Response | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
    clearTimeout(timer);
    return { res, error: null };
  } catch (err) {
    return { res: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function baseUrl(raw: string): string {
  const u = new URL(raw);
  return `${u.protocol}//${u.host}`;
}

function resolveUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function detectProtocol(res: Response): Protocol {
  const wwwAuth = res.headers.get("www-authenticate") ?? "";
  // x402 uses X-Payment-Required (also seen as PAYMENT-REQUIRED per spec)
  const xPaymentRequired =
    res.headers.get("x-payment-required") ??
    res.headers.get("payment-required") ??
    "";
  if (xPaymentRequired) return "x402";
  if (wwwAuth.toLowerCase().includes("l402")) return "L402";
  return "unknown";
}

export async function POST(req: NextRequest) {
  let body: { url?: string; paymentToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const base = baseUrl(targetUrl);
  const paymentToken = body.paymentToken?.trim() ?? "";
  const checks: CheckResult[] = [];
  let detectedProtocol: Protocol = "unknown";

  // ── Check 1: Returns 402 without payment ──────────────────────────────────
  {
    const { res, error } = await safeFetch(targetUrl, { method: "GET" });
    if (error || !res) {
      checks.push({
        id: "402_without_payment",
        label: "Returns 402 without payment",
        status: "fail",
        detail: error ?? "No response",
      });
    } else if (res.status === 402) {
      detectedProtocol = detectProtocol(res);
      checks.push({
        id: "402_without_payment",
        label: "Returns 402 without payment",
        status: "pass",
        detail: `Got 402 Payment Required`,
      });
    } else {
      checks.push({
        id: "402_without_payment",
        label: "Returns 402 without payment",
        status: "fail",
        detail: `Expected 402 but got ${res.status}`,
      });
    }
  }

  // ── Check 2: Payment header / body present on 402 ─────────────────────────
  {
    const { res } = await safeFetch(targetUrl, { method: "GET" });
    if (!res) {
      checks.push({
        id: "payment_header",
        label: "Payment details present on 402",
        status: "skip",
        detail: "Skipped — could not reach endpoint",
      });
    } else if (res.status !== 402) {
      checks.push({
        id: "payment_header",
        label: "Payment details present on 402",
        status: "skip",
        detail: "Skipped — endpoint did not return 402",
      });
    } else {
      // x402: X-Payment-Required header (base64 JSON) or body
      const xPaymentRequired =
        res.headers.get("x-payment-required") ??
        res.headers.get("payment-required") ??
        "";
      // L402: WWW-Authenticate: L402 ...
      const wwwAuth = res.headers.get("www-authenticate") ?? "";
      const isL402 = wwwAuth.toLowerCase().includes("l402");
      const isX402 = !!xPaymentRequired;

      if (isX402) {
        // Try to decode the base64 payload to validate it
        let decoded: unknown = null;
        try {
          decoded = JSON.parse(Buffer.from(xPaymentRequired, "base64").toString("utf-8"));
        } catch {
          // might not be base64 — try raw JSON
          try {
            decoded = JSON.parse(xPaymentRequired);
          } catch {
            /* leave null */
          }
        }
        checks.push({
          id: "payment_header",
          label: "Payment details present on 402",
          status: "pass",
          detail: decoded
            ? `x402: X-Payment-Required header found with valid JSON payload`
            : `x402: X-Payment-Required header found (could not decode payload)`,
          data: decoded ?? undefined,
        });
      } else if (isL402) {
        checks.push({
          id: "payment_header",
          label: "Payment details present on 402",
          status: "pass",
          detail: `L402: WWW-Authenticate: ${wwwAuth.slice(0, 120)}`,
        });
      } else {
        // check body for x402-style JSON payment requirements
        let bodyData: unknown = null;
        try {
          const text = await res.clone().text();
          bodyData = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        const bodyHasPayment =
          bodyData !== null &&
          typeof bodyData === "object" &&
          ("accepts" in (bodyData as object) ||
            "paymentRequired" in (bodyData as object) ||
            "payment_required" in (bodyData as object));

        checks.push({
          id: "payment_header",
          label: "Payment details present on 402",
          status: bodyHasPayment ? "warn" : "warn",
          detail: bodyHasPayment
            ? "Payment details found in response body but not in headers — prefer X-Payment-Required (x402) or WWW-Authenticate: L402 header"
            : "No X-Payment-Required (x402) or WWW-Authenticate: L402 header found on 402 response",
          data: bodyHasPayment ? bodyData : undefined,
        });
      }
    }
  }

  // ── Check 3: Succeeds with payment token ──────────────────────────────────
  if (paymentToken) {
    // Send payment using the appropriate header for the detected protocol
    const authHeader: Record<string, string> =
      detectedProtocol === "x402"
        ? { "X-Payment": paymentToken }
        : { Authorization: `L402 ${paymentToken}` };

    const { res, error } = await safeFetch(targetUrl, {
      method: "GET",
      headers: authHeader,
    });

    const headerName = detectedProtocol === "x402" ? "X-Payment" : "Authorization: L402";

    if (error || !res) {
      checks.push({
        id: "200_with_payment",
        label: "Returns 200 with valid payment token",
        status: "fail",
        detail: error ?? "No response",
      });
    } else if (res.status >= 200 && res.status < 300) {
      checks.push({
        id: "200_with_payment",
        label: "Returns 200 with valid payment token",
        status: "pass",
        detail: `Got ${res.status} using ${headerName}`,
      });
    } else {
      checks.push({
        id: "200_with_payment",
        label: "Returns 200 with valid payment token",
        status: "fail",
        detail: `Expected 2xx but got ${res.status} using ${headerName}`,
      });
    }
  } else {
    const tokenHint =
      detectedProtocol === "x402"
        ? "x402: provide base64-encoded PaymentPayload as the X-Payment header value"
        : detectedProtocol === "L402"
        ? "L402: provide macaroon:preimage token"
        : "Provide a payment token to test authenticated access";
    checks.push({
      id: "200_with_payment",
      label: "Returns 200 with valid payment token",
      status: "skip",
      detail: tokenHint,
    });
  }

  // ── Check 4: openapi.json at base ─────────────────────────────────────────
  {
    const openapiUrl = resolveUrl(base, "openapi.json");
    const { res, error } = await safeFetch(openapiUrl);
    if (error || !res) {
      checks.push({
        id: "openapi_json",
        label: "openapi.json accessible",
        status: "fail",
        detail: error ?? `Could not reach ${openapiUrl}`,
      });
    } else if (res.status === 200) {
      let parsed: unknown = null;
      let parseError: string | null = null;
      try {
        parsed = JSON.parse(await res.text());
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
      }
      if (parseError) {
        checks.push({
          id: "openapi_json",
          label: "openapi.json accessible",
          status: "warn",
          detail: `File found but is not valid JSON: ${parseError}`,
        });
      } else {
        const spec = parsed as Record<string, unknown>;
        const hasOpenapi = "openapi" in spec || "swagger" in spec;
        checks.push({
          id: "openapi_json",
          label: "openapi.json accessible",
          status: hasOpenapi ? "pass" : "warn",
          detail: hasOpenapi
            ? `Valid OpenAPI spec (version: ${spec.openapi ?? spec.swagger})`
            : "File found but missing 'openapi' or 'swagger' field",
          data: spec,
        });
      }
    } else {
      checks.push({
        id: "openapi_json",
        label: "openapi.json accessible",
        status: "fail",
        detail: `Got ${res.status} from ${openapiUrl}`,
      });
    }
  }

  // ── Check 5: .well-known/agent-card ───────────────────────────────────────
  {
    const agentCardUrl = resolveUrl(base, ".well-known/agent-card");
    const { res, error } = await safeFetch(agentCardUrl);
    if (error || !res) {
      checks.push({
        id: "agent_card",
        label: ".well-known/agent-card accessible",
        status: "fail",
        detail: error ?? `Could not reach ${agentCardUrl}`,
      });
    } else if (res.status === 200) {
      let parsed: unknown = null;
      let parseError: string | null = null;
      try {
        parsed = JSON.parse(await res.text());
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
      }
      if (parseError) {
        checks.push({
          id: "agent_card",
          label: ".well-known/agent-card accessible",
          status: "warn",
          detail: `File found but is not valid JSON: ${parseError}`,
        });
      } else {
        const card = parsed as Record<string, unknown>;
        const missingFields = (["name", "url"] as const).filter((f) => !(f in card));
        checks.push({
          id: "agent_card",
          label: ".well-known/agent-card accessible",
          status: missingFields.length === 0 ? "pass" : "warn",
          detail:
            missingFields.length === 0
              ? `Agent card found: "${card.name}"`
              : `Agent card found but missing fields: ${missingFields.join(", ")}`,
          data: card,
        });
      }
    } else {
      checks.push({
        id: "agent_card",
        label: ".well-known/agent-card accessible",
        status: "fail",
        detail: `Got ${res.status} from ${agentCardUrl}`,
      });
    }
  }

  // ── Check 6: CORS headers ─────────────────────────────────────────────────
  {
    const { res, error } = await safeFetch(targetUrl, {
      method: "OPTIONS",
      headers: {
        Origin: "https://machine-payments-doctor.vercel.app",
        "Access-Control-Request-Method": "GET",
      },
    });
    if (error || !res) {
      checks.push({
        id: "cors",
        label: "CORS headers present",
        status: "warn",
        detail: "Could not verify CORS — OPTIONS request failed",
      });
    } else {
      const acao = res.headers.get("access-control-allow-origin") ?? "";
      const acam = res.headers.get("access-control-allow-methods") ?? "";
      if (acao) {
        checks.push({
          id: "cors",
          label: "CORS headers present",
          status: "pass",
          detail: `Access-Control-Allow-Origin: ${acao}${acam ? `, Methods: ${acam}` : ""}`,
        });
      } else {
        checks.push({
          id: "cors",
          label: "CORS headers present",
          status: "warn",
          detail:
            "No Access-Control-Allow-Origin on OPTIONS — browser-based agents may be blocked",
        });
      }
    }
  }

  // ── Check 7: Content-Type on 402 ──────────────────────────────────────────
  {
    const { res } = await safeFetch(targetUrl, { method: "GET" });
    if (res && res.status === 402) {
      const ct = res.headers.get("content-type") ?? "";
      const isJson = ct.includes("application/json");
      checks.push({
        id: "content_type_402",
        label: "402 response has JSON Content-Type",
        status: isJson ? "pass" : "warn",
        detail: isJson
          ? `Content-Type: ${ct}`
          : `Content-Type is "${ct || "(none)"}" — machine clients expect application/json`,
      });
    } else {
      checks.push({
        id: "content_type_402",
        label: "402 response has JSON Content-Type",
        status: "skip",
        detail: "Skipped — endpoint did not return 402",
      });
    }
  }

  const response: CheckResponse = {
    url: targetUrl,
    protocol: detectedProtocol,
    checks,
    testedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
