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
        detail: `Got ${res.status} Payment Required`,
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

  // ── Check 2: WWW-Authenticate / X-Payment-Details header present ──────────
  {
    const { res } = await safeFetch(targetUrl, { method: "GET" });
    if (!res) {
      checks.push({
        id: "payment_header",
        label: "Payment header present on 402",
        status: "skip",
        detail: "Skipped — could not reach endpoint",
      });
    } else {
      const wwwAuth = res.headers.get("www-authenticate") ?? "";
      const xPayment = res.headers.get("x-payment-details") ?? "";
      const xAccept = res.headers.get("x-accept-payment") ?? "";
      if (wwwAuth.toLowerCase().includes("l402") || xPayment || xAccept) {
        const header = wwwAuth || xPayment || xAccept;
        checks.push({
          id: "payment_header",
          label: "Payment header present on 402",
          status: "pass",
          detail: header,
        });
      } else {
        checks.push({
          id: "payment_header",
          label: "Payment header present on 402",
          status: "warn",
          detail:
            "No WWW-Authenticate: L402 or X-Payment-Details header found. Include payment instructions in the 402 response.",
        });
      }
    }
  }

  // ── Check 3: Succeeds with payment token ──────────────────────────────────
  if (paymentToken) {
    const { res, error } = await safeFetch(targetUrl, {
      method: "GET",
      headers: { Authorization: `L402 ${paymentToken}` },
    });
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
        detail: `Got ${res.status}`,
      });
    } else {
      checks.push({
        id: "200_with_payment",
        label: "Returns 200 with valid payment token",
        status: "fail",
        detail: `Expected 2xx but got ${res.status}`,
      });
    }
  } else {
    checks.push({
      id: "200_with_payment",
      label: "Returns 200 with valid payment token",
      status: "skip",
      detail: "Provide an L402 payment token above to test authenticated access",
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
        const text = await res.text();
        parsed = JSON.parse(text);
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
        const text = await res.text();
        parsed = JSON.parse(text);
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
        const hasName = "name" in card;
        const hasUrl = "url" in card;
        const missingFields = [
          !hasName && "name",
          !hasUrl && "url",
        ].filter(Boolean);
        checks.push({
          id: "agent_card",
          label: ".well-known/agent-card accessible",
          status: missingFields.length === 0 ? "pass" : "warn",
          detail:
            missingFields.length === 0
              ? `Agent card found with name: "${card.name}"`
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
      headers: { Origin: "https://mppchecker.com", "Access-Control-Request-Method": "GET" },
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
            "No Access-Control-Allow-Origin header on OPTIONS — agents calling from browsers may be blocked",
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
    checks,
    testedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
