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

  // Known asset addresses (lowercase for comparison)
  const USDC_MAINNET = "0x20c000000000000000000000b9537d11c60e8b50";
  const TESTNET_ASSETS = new Set([
    "0x20c0000000000000000000000000000000000000",
    "0x20c0000000000000000000000000000000000001",
    "0x20c0000000000000000000000000000000000002",
    "0x20c0000000000000000000000000000000000003",
  ]);

  function decodePaymentRequired(header: string): unknown {
    try {
      return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    } catch {
      try { return JSON.parse(header); } catch { return null; }
    }
  }

  function extractAssets(decoded: unknown): string[] {
    if (!decoded || typeof decoded !== "object") return [];
    // The payload is an array of PaymentRequirement objects, each with an `asset` field
    const arr = Array.isArray(decoded) ? decoded : [decoded];
    return arr.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const e = entry as Record<string, unknown>;
      // Top-level asset
      const assets: string[] = [];
      if (typeof e.asset === "string") assets.push(e.asset.toLowerCase());
      // Some implementations nest under `accepts`
      if (Array.isArray(e.accepts)) {
        for (const a of e.accepts) {
          if (a && typeof a === "object" && typeof (a as Record<string, unknown>).asset === "string") {
            assets.push(((a as Record<string, unknown>).asset as string).toLowerCase());
          }
        }
      }
      return assets;
    });
  }

  // Fetch 402 response once and reuse
  const { res: initialRes, error: initialError } = await safeFetch(targetUrl, { method: "GET" });

  // ── Check 1: Returns 402 without payment ──────────────────────────────────
  if (initialError || !initialRes) {
    checks.push({
      id: "402_without_payment",
      label: "Returns 402 without payment",
      status: "fail",
      detail: initialError ?? "No response",
    });
  } else if (initialRes.status === 402) {
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
      detail: `Expected 402 but got ${initialRes.status}`,
    });
  }

  // ── Check 2: x402 payment details present on 402 ─────────────────────────
  let decodedPayload: unknown = null;

  if (!initialRes || initialRes.status !== 402) {
    checks.push({
      id: "x402_header",
      label: "x402 payment details on 402 response",
      status: "skip",
      detail: "Skipped — endpoint did not return 402",
    });
  } else {
    const xPaymentRequired =
      initialRes.headers.get("x-payment-required") ??
      initialRes.headers.get("payment-required") ??
      "";
    const wwwAuth = initialRes.headers.get("www-authenticate") ?? "";

    if (xPaymentRequired) {
      decodedPayload = decodePaymentRequired(xPaymentRequired);
      checks.push({
        id: "x402_header",
        label: "x402 payment details on 402 response",
        status: "pass",
        detail: decodedPayload
          ? "X-Payment-Required header present with valid JSON payload"
          : "X-Payment-Required header present (could not decode payload)",
        data: decodedPayload ?? undefined,
      });
    } else if (wwwAuth) {
      checks.push({
        id: "x402_header",
        label: "x402 payment details on 402 response",
        status: "warn",
        detail: `WWW-Authenticate header found but not x402 format. Found: ${wwwAuth.slice(0, 100)}`,
      });
    } else {
      let bodyData: unknown = null;
      try {
        const text = await initialRes.clone().text();
        bodyData = JSON.parse(text);
      } catch { /* not JSON */ }
      const bodyHasPayment =
        bodyData !== null &&
        typeof bodyData === "object" &&
        ("accepts" in (bodyData as object) || "paymentRequired" in (bodyData as object));
      if (bodyHasPayment) decodedPayload = bodyData;
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

  // ── Check 3: Accepted assets — mainnet USDC + testnet detection ───────────
  {
    if (!initialRes || initialRes.status !== 402 || decodedPayload === null) {
      checks.push({
        id: "payment_assets",
        label: "Payment assets (mainnet USDC)",
        status: "skip",
        detail: "Skipped — no x402 payment payload to inspect",
      });
    } else {
      const assets = extractAssets(decodedPayload);
      const hasUsdcMainnet = assets.includes(USDC_MAINNET);
      const testnetFound = assets.filter((a) => TESTNET_ASSETS.has(a));
      const unknownAssets = assets.filter((a) => a !== USDC_MAINNET && !TESTNET_ASSETS.has(a));

      if (assets.length === 0) {
        checks.push({
          id: "payment_assets",
          label: "Payment assets (mainnet USDC)",
          status: "warn",
          detail: "No asset addresses found in the payment payload",
        });
      } else if (!hasUsdcMainnet) {
        const parts: string[] = [];
        if (testnetFound.length > 0) parts.push(`testnet PathUSD (${testnetFound.join(", ")})`);
        if (unknownAssets.length > 0) parts.push(`unknown assets (${unknownAssets.join(", ")})`);
        checks.push({
          id: "payment_assets",
          label: "Payment assets (mainnet USDC)",
          status: "fail",
          detail: `Mainnet USDC (${USDC_MAINNET}) not offered. Found: ${parts.join("; ") || assets.join(", ")}`,
        });
      } else {
        // Has USDC mainnet — check if testnet tokens are also present
        if (testnetFound.length > 0) {
          checks.push({
            id: "payment_assets",
            label: "Payment assets (mainnet USDC)",
            status: "warn",
            detail: `Mainnet USDC offered ✓, but testnet PathUSD tokens are also accepted (${testnetFound.join(", ")}). Testnet tokens are useful for testing but can confuse agents in production — consider serving USDC only.`,
          });
        } else {
          checks.push({
            id: "payment_assets",
            label: "Payment assets (mainnet USDC)",
            status: "pass",
            detail: `Mainnet USDC accepted (${USDC_MAINNET})${unknownAssets.length > 0 ? ` · also accepts: ${unknownAssets.join(", ")}` : ""}`,
          });
        }
      }
    }
  }

  // ── Check 4: openapi.json ─────────────────────────────────────────────────
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

  // ── Check 5: llms.txt ────────────────────────────────────────────────────
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

  // ── Check 6: .well-known/agent-card.json ─────────────────────────────────
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

  // ── Check 7: CORS headers ─────────────────────────────────────────────────
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
