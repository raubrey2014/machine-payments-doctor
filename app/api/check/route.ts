import { NextRequest, NextResponse } from "next/server";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  data?: unknown;
}

export interface EndpointResult {
  path: string;
  method: string;
  summary?: string;
  fullUrl: string;
  checks: CheckResult[];
}

export interface CheckResponse {
  url: string;
  baseChecks: CheckResult[];
  specTitle?: string;
  totalEndpoints: number;   // endpoints in spec with payment markers
  endpoints: EndpointResult[];
  testedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function originOf(raw: string): string {
  const u = new URL(raw);
  return `${u.protocol}//${u.host}`;
}

function resolveUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

// ── Asset constants ───────────────────────────────────────────────────────────

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
  const arr = Array.isArray(decoded) ? decoded : [decoded];
  return arr.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const assets: string[] = [];
    if (typeof e.asset === "string") assets.push(e.asset.toLowerCase());
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

// ── OpenAPI types ─────────────────────────────────────────────────────────────

interface OasOperation {
  summary?: string;
  tags?: string[];
  responses?: Record<string, unknown>;
  "x-payment-info"?: unknown;
}

interface OasPathItem {
  get?: OasOperation;
  post?: OasOperation;
  put?: OasOperation;
  delete?: OasOperation;
  patch?: OasOperation;
}

interface OasSpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, OasPathItem>;
}

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;

interface DiscoveredEndpoint {
  path: string;
  method: string;
  summary?: string;
  fullUrl: string;
  tags?: string[];
}

function discoverEndpoints(spec: OasSpec, origin: string): DiscoveredEndpoint[] {
  const rawServerUrl = spec.servers?.[0]?.url ?? origin;
  const serverBase = rawServerUrl.startsWith("http")
    ? rawServerUrl.replace(/\/$/, "")
    : `${origin}${rawServerUrl}`.replace(/\/$/, "");

  const paths = spec.paths ?? {};
  const payment: DiscoveredEndpoint[] = [];
  const nonPayment: DiscoveredEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const hasPaymentInfo = "x-payment-info" in op;
      const has402 = op.responses && "402" in op.responses;

      const endpoint: DiscoveredEndpoint = {
        path,
        method: method.toUpperCase(),
        summary: op.summary,
        fullUrl: `${serverBase}${path}`,
        tags: op.tags,
      };

      if (hasPaymentInfo || has402) {
        payment.push(endpoint);
      } else {
        nonPayment.push(endpoint);
      }
    }
  }

  const pool = payment.length > 0 ? payment : nonPayment.filter((e) => e.method === "GET");

  // Pick one endpoint per tag group for diversity, then fill up to 8
  const seenTags = new Set<string>();
  const seenPaths = new Set<string>();
  const selected: DiscoveredEndpoint[] = [];

  // First pass: one per tag
  for (const ep of pool) {
    if (selected.length >= 8) break;
    const tag = ep.tags?.[0] ?? "__untagged__";
    if (!seenTags.has(tag) && !seenPaths.has(ep.path)) {
      selected.push(ep);
      seenTags.add(tag);
      seenPaths.add(ep.path);
    }
  }

  // Second pass: fill remaining slots with unseen paths
  for (const ep of pool) {
    if (selected.length >= 8) break;
    if (!seenPaths.has(ep.path)) {
      selected.push(ep);
      seenPaths.add(ep.path);
    }
  }

  return selected;
}

// ── Per-endpoint checks ───────────────────────────────────────────────────────

async function checkEndpoint(endpoint: DiscoveredEndpoint): Promise<EndpointResult> {
  const checks: CheckResult[] = [];
  const { res, error } = await safeFetch(endpoint.fullUrl, { method: endpoint.method });

  // Check 1: 402
  if (error || !res) {
    checks.push({
      id: "402",
      label: "Returns 402 without payment",
      status: "fail",
      detail: error ?? "No response",
    });
    return { ...endpoint, checks };
  }

  if (res.status === 402) {
    checks.push({
      id: "402",
      label: "Returns 402 without payment",
      status: "pass",
      detail: "Got 402 Payment Required",
    });
  } else {
    checks.push({
      id: "402",
      label: "Returns 402 without payment",
      status: "fail",
      detail: `Expected 402 but got ${res.status}`,
    });
    // No point inspecting payment headers if there's no 402
    return { ...endpoint, checks };
  }

  // Check 2: x402 header
  const xPaymentRequired =
    res.headers.get("x-payment-required") ??
    res.headers.get("payment-required") ??
    "";
  const wwwAuth = res.headers.get("www-authenticate") ?? "";
  let decodedPayload: unknown = null;

  if (xPaymentRequired) {
    decodedPayload = decodePaymentRequired(xPaymentRequired);
    checks.push({
      id: "x402_header",
      label: "x402 payment details",
      status: "pass",
      detail: decodedPayload
        ? "X-Payment-Required header with valid JSON payload"
        : "X-Payment-Required header present (could not decode payload)",
      data: decodedPayload ?? undefined,
    });
  } else if (wwwAuth) {
    checks.push({
      id: "x402_header",
      label: "x402 payment details",
      status: "warn",
      detail: `WWW-Authenticate found but not x402 format: ${wwwAuth.slice(0, 80)}`,
    });
  } else {
    checks.push({
      id: "x402_header",
      label: "x402 payment details",
      status: "warn",
      detail: "No X-Payment-Required header on 402 — agents won't know how to pay",
    });
  }

  // Check 3: assets
  if (decodedPayload !== null) {
    const assets = extractAssets(decodedPayload);
    const hasUsdcMainnet = assets.includes(USDC_MAINNET);
    const testnetFound = assets.filter((a) => TESTNET_ASSETS.has(a));
    const unknownAssets = assets.filter((a) => a !== USDC_MAINNET && !TESTNET_ASSETS.has(a));

    if (assets.length === 0) {
      checks.push({
        id: "payment_assets",
        label: "Mainnet USDC accepted",
        status: "warn",
        detail: "No asset addresses found in payload",
      });
    } else if (!hasUsdcMainnet) {
      const parts: string[] = [];
      if (testnetFound.length > 0) parts.push(`testnet PathUSD (${testnetFound.join(", ")})`);
      if (unknownAssets.length > 0) parts.push(unknownAssets.join(", "));
      checks.push({
        id: "payment_assets",
        label: "Mainnet USDC accepted",
        status: "fail",
        detail: `Mainnet USDC not offered. Found: ${parts.join("; ") || assets.join(", ")}`,
      });
    } else if (testnetFound.length > 0) {
      checks.push({
        id: "payment_assets",
        label: "Mainnet USDC accepted",
        status: "warn",
        detail: `USDC ✓ — but testnet PathUSD tokens also accepted (${testnetFound.join(", ")}). Can confuse agents in production.`,
      });
    } else {
      checks.push({
        id: "payment_assets",
        label: "Mainnet USDC accepted",
        status: "pass",
        detail: `Mainnet USDC accepted${unknownAssets.length > 0 ? ` · also: ${unknownAssets.join(", ")}` : ""}`,
      });
    }
  } else {
    checks.push({
      id: "payment_assets",
      label: "Mainnet USDC accepted",
      status: "skip",
      detail: "Skipped — no decoded payload to inspect",
    });
  }

  return { ...endpoint, checks };
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

  const origin = originOf(targetUrl);
  const baseChecks: CheckResult[] = [];

  // ── Base check 1: openapi.json ────────────────────────────────────────────
  const openapiUrl = resolveUrl(origin, "openapi.json");
  let spec: OasSpec | null = null;
  let specTitle: string | undefined;

  {
    const { res, error } = await safeFetch(openapiUrl);
    if (error || !res) {
      baseChecks.push({
        id: "openapi_json",
        label: "openapi.json (MPP discovery)",
        status: "fail",
        detail: error ?? `Could not reach ${openapiUrl}`,
      });
    } else if (res.status === 200) {
      let parseError: string | null = null;
      try {
        spec = JSON.parse(await res.text()) as OasSpec;
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
      }
      if (parseError || !spec) {
        baseChecks.push({
          id: "openapi_json",
          label: "openapi.json (MPP discovery)",
          status: "warn",
          detail: `Found but not valid JSON: ${parseError}`,
        });
      } else {
        const hasOpenapi = "openapi" in spec || "swagger" in spec;
        const hasPaymentInfo = JSON.stringify(spec).includes("x-payment-info");
        specTitle = spec.info?.title;
        baseChecks.push({
          id: "openapi_json",
          label: "openapi.json (MPP discovery)",
          status: hasOpenapi ? "pass" : "warn",
          detail: hasOpenapi
            ? `OpenAPI ${spec.openapi ?? spec.swagger}${hasPaymentInfo ? " · x-payment-info extension found" : " · no x-payment-info extension"}`
            : "Found but missing 'openapi' field",
          data: { info: spec.info, servers: spec.servers, pathCount: Object.keys(spec.paths ?? {}).length },
        });
      }
    } else {
      baseChecks.push({
        id: "openapi_json",
        label: "openapi.json (MPP discovery)",
        status: "fail",
        detail: `Got ${res.status} from ${openapiUrl}`,
      });
    }
  }

  // ── Run remaining base checks in parallel ─────────────────────────────────
  const [llmsResult, agentCardResult, corsResult] = await Promise.all([
    // llms.txt
    safeFetch(resolveUrl(origin, "llms.txt")).then(async ({ res, error }) => {
      if (error || !res) return { id: "llms_txt", label: "llms.txt (AI context file)", status: "fail" as CheckStatus, detail: error ?? "No response" };
      if (res.status === 200) {
        const text = await res.text().catch(() => "");
        const lines = text.split("\n").filter((l) => l.trim()).length;
        return { id: "llms_txt", label: "llms.txt (AI context file)", status: "pass" as CheckStatus, detail: `${lines} lines` };
      }
      return { id: "llms_txt", label: "llms.txt (AI context file)", status: "fail" as CheckStatus, detail: `Got ${res.status}` };
    }),

    // .well-known/agent-card.json
    (async () => {
      for (const path of [".well-known/agent-card.json", ".well-known/agent-card"]) {
        const { res } = await safeFetch(resolveUrl(origin, path));
        if (res?.status === 200) {
          let card: unknown = null;
          try { card = JSON.parse(await res.text()); } catch { /* not JSON */ }
          if (card && typeof card === "object") {
            const c = card as Record<string, unknown>;
            const missing = (["name", "url"] as const).filter((f) => !(f in c));
            return {
              id: "agent_card", label: ".well-known/agent-card.json",
              status: (missing.length === 0 ? "pass" : "warn") as CheckStatus,
              detail: missing.length === 0 ? `name: "${c.name}"` : `Missing fields: ${missing.join(", ")}`,
              data: c,
            };
          }
          return { id: "agent_card", label: ".well-known/agent-card.json", status: "warn" as CheckStatus, detail: `Found at ${path} but not valid JSON` };
        }
      }
      return { id: "agent_card", label: ".well-known/agent-card.json", status: "fail" as CheckStatus, detail: `Not found at ${resolveUrl(origin, ".well-known/agent-card.json")}` };
    })(),

    // CORS
    safeFetch(origin, {
      method: "OPTIONS",
      headers: { Origin: "https://machine-payments-doctor.vercel.app", "Access-Control-Request-Method": "GET" },
    }).then(({ res, error }) => {
      if (error || !res) return { id: "cors", label: "CORS headers", status: "warn" as CheckStatus, detail: "OPTIONS request failed" };
      const acao = res.headers.get("access-control-allow-origin") ?? "";
      const acam = res.headers.get("access-control-allow-methods") ?? "";
      return {
        id: "cors", label: "CORS headers",
        status: (acao ? "pass" : "warn") as CheckStatus,
        detail: acao ? `Allow-Origin: ${acao}${acam ? ` · Methods: ${acam}` : ""}` : "No Access-Control-Allow-Origin — browser agents may be blocked",
      };
    }),
  ]);

  baseChecks.push(llmsResult, agentCardResult, corsResult);

  // ── Discover and test endpoints ───────────────────────────────────────────
  let endpoints: EndpointResult[] = [];
  let totalEndpoints = 0;

  if (spec) {
    const discovered = discoverEndpoints(spec, origin);
    // Count all payment-marked endpoints in spec (before capping)
    totalEndpoints = Object.entries(spec.paths ?? {}).reduce((count, [, pathItem]) => {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (op && ("x-payment-info" in op || (op.responses && "402" in op.responses))) count++;
      }
      return count;
    }, 0);

    // Test up to 8 in parallel
    endpoints = await Promise.all(discovered.map(checkEndpoint));
  }

  // If no spec, fall back to testing the target URL directly
  if (endpoints.length === 0) {
    const fallback = await checkEndpoint({
      path: new URL(targetUrl).pathname || "/",
      method: "GET",
      fullUrl: targetUrl,
    });
    endpoints = [fallback];
    totalEndpoints = 1;
  }

  return NextResponse.json({
    url: targetUrl,
    baseChecks,
    specTitle,
    totalEndpoints,
    endpoints,
    testedAt: new Date().toISOString(),
  } satisfies CheckResponse);
}
