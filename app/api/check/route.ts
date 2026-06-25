import { NextRequest, NextResponse } from "next/server";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  data?: unknown;
}

export interface CheckResponse {
  url: string;
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

export async function POST(req: NextRequest) {
  let body: { url?: string };
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
  const checks: CheckResult[] = [];

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
      checks.push({
        id: "402_without_payment",
        label: "Returns 402 without payment",
        status: "pass",
        detail: "Got 402 Payment Required",
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

  // ── Check 2: x402 payment details present on 402 ─────────────────────────
  {
    const { res } = await safeFetch(targetUrl, { method: "GET" });
    if (!res || res.status !== 402) {
      checks.push({
        id: "x402_header",
        label: "x402 payment details on 402 response",
        status: "skip",
        detail: "Skipped — endpoint did not return 402",
      });
    } else {
      const xPaymentRequired =
        res.headers.get("x-payment-required") ??
        res.headers.get("payment-required") ??
        "";
      const wwwAuth = res.headers.get("www-authenticate") ?? "";

      if (xPaymentRequired) {
        let decoded: unknown = null;
        try {
          decoded = JSON.parse(Buffer.from(xPaymentRequired, "base64").toString("utf-8"));
        } catch {
          try { decoded = JSON.parse(xPaymentRequired); } catch { /* leave null */ }
        }
        checks.push({
          id: "x402_header",
          label: "x402 payment details on 402 response",
          status: "pass",
          detail: decoded
            ? "X-Payment-Required header present with valid JSON payload"
            : "X-Payment-Required header present (could not decode payload)",
          data: decoded ?? undefined,
        });
      } else if (wwwAuth) {
        checks.push({
          id: "x402_header",
          label: "x402 payment details on 402 response",
          status: "warn",
          detail: `WWW-Authenticate header found but not x402 format. Found: ${wwwAuth.slice(0, 100)}`,
        });
      } else {
        // Check body for payment info
        let bodyData: unknown = null;
        try {
          const text = await res.clone().text();
          bodyData = JSON.parse(text);
        } catch { /* not JSON */ }
        const bodyHasPayment =
          bodyData !== null &&
          typeof bodyData === "object" &&
          ("accepts" in (bodyData as object) || "paymentRequired" in (bodyData as object));
        checks.push({
          id: "x402_header",
          label: "x402 payment details on 402 response",
          status: "warn",
          detail: bodyHasPayment
            ? "Payment details found in body but not in X-Payment-Required header — prefer the header"
            : "No X-Payment-Required header on 402. Add payment details so agents know how to pay.",
          data: bodyHasPayment ? bodyData : undefined,
        });
      }
    }
  }

  // ── Check 3: openapi.json ─────────────────────────────────────────────────
  {
    const openapiUrl = resolveUrl(base, "openapi.json");
    const { res, error } = await safeFetch(openapiUrl);
    if (error || !res) {
      checks.push({
        id: "openapi_json",
        label: "openapi.json (MPP discovery)",
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
          label: "openapi.json (MPP discovery)",
          status: "warn",
          detail: `Found but not valid JSON: ${parseError}`,
        });
      } else {
        const spec = parsed as Record<string, unknown>;
        const hasOpenapi = "openapi" in spec || "swagger" in spec;
        const hasPaymentInfo = JSON.stringify(spec).includes("x-payment-info");
        checks.push({
          id: "openapi_json",
          label: "openapi.json (MPP discovery)",
          status: hasOpenapi ? "pass" : "warn",
          detail: hasOpenapi
            ? `OpenAPI ${spec.openapi ?? spec.swagger}${hasPaymentInfo ? " · x-payment-info extension found" : " · no x-payment-info extension"}`
            : "Found but missing 'openapi' field",
          data: spec,
        });
      }
    } else {
      checks.push({
        id: "openapi_json",
        label: "openapi.json (MPP discovery)",
        status: "fail",
        detail: `Got ${res.status} from ${openapiUrl}`,
      });
    }
  }

  // ── Check 4: llms.txt ────────────────────────────────────────────────────
  {
    const llmsUrl = resolveUrl(base, "llms.txt");
    const { res, error } = await safeFetch(llmsUrl);
    if (error || !res) {
      checks.push({
        id: "llms_txt",
        label: "llms.txt (AI context file)",
        status: "fail",
        detail: error ?? `Could not reach ${llmsUrl}`,
      });
    } else if (res.status === 200) {
      const text = await res.text().catch(() => "");
      const lines = text.split("\n").filter((l) => l.trim()).length;
      checks.push({
        id: "llms_txt",
        label: "llms.txt (AI context file)",
        status: "pass",
        detail: `Found at ${llmsUrl} (${lines} lines)`,
      });
    } else {
      checks.push({
        id: "llms_txt",
        label: "llms.txt (AI context file)",
        status: "fail",
        detail: `Got ${res.status} from ${llmsUrl}`,
      });
    }
  }

  // ── Check 5: .well-known/agent-card.json ─────────────────────────────────
  {
    // Try both with and without .json extension
    const candidates = [
      resolveUrl(base, ".well-known/agent-card.json"),
      resolveUrl(base, ".well-known/agent-card"),
    ];
    let found = false;
    for (const agentCardUrl of candidates) {
      const { res, error } = await safeFetch(agentCardUrl);
      if (error || !res) continue;
      if (res.status === 200) {
        found = true;
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
            label: ".well-known/agent-card.json",
            status: "warn",
            detail: `Found at ${agentCardUrl} but not valid JSON: ${parseError}`,
          });
        } else {
          const card = parsed as Record<string, unknown>;
          const missingFields = (["name", "url"] as const).filter((f) => !(f in card));
          checks.push({
            id: "agent_card",
            label: ".well-known/agent-card.json",
            status: missingFields.length === 0 ? "pass" : "warn",
            detail:
              missingFields.length === 0
                ? `Found at ${agentCardUrl} · name: "${card.name}"`
                : `Found at ${agentCardUrl} but missing fields: ${missingFields.join(", ")}`,
            data: card,
          });
        }
        break;
      }
    }
    if (!found) {
      checks.push({
        id: "agent_card",
        label: ".well-known/agent-card.json",
        status: "fail",
        detail: `Not found at ${candidates[0]}`,
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
        label: "CORS headers (cross-origin agent access)",
        status: "warn",
        detail: "Could not verify CORS — OPTIONS request failed",
      });
    } else {
      const acao = res.headers.get("access-control-allow-origin") ?? "";
      const acam = res.headers.get("access-control-allow-methods") ?? "";
      checks.push({
        id: "cors",
        label: "CORS headers (cross-origin agent access)",
        status: acao ? "pass" : "warn",
        detail: acao
          ? `Access-Control-Allow-Origin: ${acao}${acam ? ` · Methods: ${acam}` : ""}`
          : "No Access-Control-Allow-Origin — browser-based agents may be blocked",
      });
    }
  }

  return NextResponse.json({ url: targetUrl, checks, testedAt: new Date().toISOString() } satisfies CheckResponse);
}
