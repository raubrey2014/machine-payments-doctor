import { Challenge } from "mppx";
import * as x402 from "mppx/x402";
import { analyzeDoctorCheck } from "./doctor-analysis";
import type { CheckResponse, CheckResult, CheckStatus, DoctorScanResult, EndpointResult } from "./doctor-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<{ res: Response | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
      return { res, error: null };
    } finally {
      clearTimeout(timer);
    }
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

// ── Network + asset registry ──────────────────────────────────────────────────

const NETWORK_NAMES: Record<string, string> = {
  "eip155:1": "Ethereum",
  "eip155:8453": "Base",
  "eip155:137": "Polygon",
  "eip155:42161": "Arbitrum",
  "eip155:10": "Optimism",
  "eip155:43114": "Avalanche",
  "eip155:56": "BNB Chain",
  "eip155:1301": "Unichain Sepolia",
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana",
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "Solana Devnet",
};

function evmAsset(...parts: string[]): string {
  return `0x${parts.join("")}`;
}

// Keyed by "network:asset" (both normalised). Solana addresses are case-sensitive.
// EVM addresses are lowercased for comparison.
const MAINNET_USDC: Record<string, string> = {
  // EVM chains — USDC (native Circle)
  "eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "eip155:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "eip155:137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC",
  "eip155:42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
  "eip155:10:0x0b2c639c533813f4aa9d7837caf62653d097ff85": "USDC",
  "eip155:43114:0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": "USDC",
  // Tempo/MPP-specific USDC identifier (no network prefix)
  [evmAsset("20c000000000000000000000", "b9537d11c60e8b50")]: "USDC (Tempo)",
  // Solana mainnet USDC
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
};

// Testnet / fake tokens — warn when present
const TESTNET_TOKENS: Record<string, string> = {
  // PathUSD testnet tokens
  [evmAsset("20c000000000000000000000", "0000000000000000")]: "PathUSD (testnet)",
  [evmAsset("20c000000000000000000000", "0000000000000001")]: "PathUSD (testnet)",
  [evmAsset("20c000000000000000000000", "0000000000000002")]: "PathUSD (testnet)",
  [evmAsset("20c000000000000000000000", "0000000000000003")]: "PathUSD (testnet)",
  // Solana devnet USDC
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC (Solana devnet)",
};

interface AcceptedAsset {
  network: string;       // raw, e.g. "eip155:8453"
  networkName: string;   // human, e.g. "Base"
  asset: string;         // normalised
  tokenName?: string;    // e.g. "USDC"
  isMainnetUsdc: boolean;
  isTestnet: boolean;
}

function rawDecodeBase64Json(header: string): unknown {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    try { return JSON.parse(header); } catch { return null; }
  }
}

function normaliseAsset(network: string, asset: string): string {
  // EVM addresses are hex, lowercase for comparison; Solana keeps case
  return network.startsWith("eip155:") ? asset.toLowerCase() : asset;
}

function extractAcceptedAssets(decoded: unknown): AcceptedAsset[] {
  if (!decoded || typeof decoded !== "object") return [];

  // Collect raw {network, asset} pairs from either the x402 v2 `accepts` array
  // or from a top-level array of PaymentRequirement objects (older/alternative format)
  const raw: Array<{ network?: string; asset?: string }> = [];

  if (Array.isArray(decoded)) {
    // Older format: array of requirements at top level
    for (const item of decoded) {
      if (item && typeof item === "object") {
        const e = item as Record<string, unknown>;
        if (typeof e.asset === "string") raw.push({ network: String(e.network ?? ""), asset: e.asset });
        if (Array.isArray(e.accepts)) {
          for (const a of e.accepts) {
            if (a && typeof a === "object") {
              const ae = a as Record<string, unknown>;
              if (typeof ae.asset === "string") raw.push({ network: String(ae.network ?? ""), asset: ae.asset });
            }
          }
        }
      }
    }
  } else {
    // x402 v2: { x402Version, resource, accepts: [...] }
    const obj = decoded as Record<string, unknown>;
    if (Array.isArray(obj.accepts)) {
      for (const a of obj.accepts) {
        if (a && typeof a === "object") {
          const ae = a as Record<string, unknown>;
          if (typeof ae.asset === "string") raw.push({ network: String(ae.network ?? ""), asset: ae.asset });
        }
      }
    }
    // Also handle a bare top-level asset field
    if (typeof obj.asset === "string") raw.push({ network: String(obj.network ?? ""), asset: obj.asset });
  }

  return raw.filter((r): r is { network: string; asset: string } => typeof r.asset === "string").map(({ network = "", asset }) => {
    const norm = normaliseAsset(network, asset);
    const networkKey = `${network}:${norm}`;
    const bareKey = norm; // for Tempo-style addresses with no network

    const tokenName = MAINNET_USDC[networkKey] ?? MAINNET_USDC[bareKey];
    const testnetName = TESTNET_TOKENS[networkKey] ?? TESTNET_TOKENS[bareKey];

    return {
      network,
      networkName: NETWORK_NAMES[network] ?? network ?? "unknown network",
      asset: norm,
      tokenName: tokenName ?? testnetName,
      isMainnetUsdc: Boolean(tokenName),
      isTestnet: Boolean(testnetName),
    };
  });
}

// ── OpenAPI types ─────────────────────────────────────────────────────────────

interface OasSchema {
  type?: string;
  format?: string;
  pattern?: string;
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
}

interface OasParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: OasSchema;
  example?: unknown;
}

interface OasOperation {
  summary?: string;
  tags?: string[];
  responses?: Record<string, unknown>;
  "x-payment-info"?: unknown;
  parameters?: OasParameter[];
}

interface OasPathItem {
  get?: OasOperation;
  post?: OasOperation;
  put?: OasOperation;
  delete?: OasOperation;
  patch?: OasOperation;
  parameters?: OasParameter[];
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
  pathParams?: OasParameter[];
}

// ── Path parameter substitution ───────────────────────────────────────────────

// Walks a regex pattern and produces a minimal matching string for common cases.
// Handles \d{N}, [cls]{N}, literals, and optional chars (X?).
function tryExampleFromPattern(pattern: string): string | null {
  const p = pattern.replace(/^\^/, "").replace(/\$$/, "");
  let result = "";
  let i = 0;

  const readQuantifier = (s: string, pos: number): { min: number; consumed: number } => {
    if (pos >= s.length) return { min: 1, consumed: 0 };
    if (s[pos] === "?") return { min: 0, consumed: 1 };
    if (s[pos] === "*") return { min: 0, consumed: 1 };
    if (s[pos] === "+") return { min: 1, consumed: 1 };
    if (s[pos] === "{") {
      const close = s.indexOf("}", pos);
      if (close === -1) return { min: 1, consumed: 0 };
      const min = parseInt(s.slice(pos + 1, close).split(",")[0]) || 1;
      return { min, consumed: close - pos + 1 };
    }
    return { min: 1, consumed: 0 };
  };

  while (i < p.length) {
    if (p[i] === "\\") {
      i++;
      const ch = p[i++];
      const q = readQuantifier(p, i);
      i += q.consumed;
      const rep = q.min === 0 ? 0 : q.min;
      if (ch === "d") result += "1".repeat(rep);
      else if (ch === "w") result += "a".repeat(rep);
      else if (ch === "s") result += " ".repeat(Math.max(rep, 0));
      else result += ch.repeat(rep === 0 ? 0 : 1);
    } else if (p[i] === "[") {
      const close = p.indexOf("]", i + 1);
      if (close === -1) { i++; continue; }
      const cls = p.slice(i + 1, close);
      i = close + 1;
      const q = readQuantifier(p, i);
      i += q.consumed;
      if (q.min === 0) continue;
      const inner = cls.startsWith("^") ? cls.slice(1) : cls;
      let sample = "a";
      if (/\\d/.test(inner)) sample = "1";
      else if (inner[0] && inner[0] !== "\\") sample = inner[0];
      result += sample.repeat(q.min);
    } else if (p[i] === "?") {
      // Optional quantifier on last literal — remove it
      result = result.slice(0, -1);
      i++;
    } else if (p[i] === "*" || p[i] === "+") {
      i++;
    } else if (p[i] === "(") {
      // Skip groups entirely
      let depth = 1;
      i++;
      while (i < p.length && depth > 0) {
        if (p[i] === "(") depth++;
        else if (p[i] === ")") depth--;
        i++;
      }
      const q = readQuantifier(p, i);
      i += q.consumed;
    } else if (p[i] === ".") {
      i++;
      const q = readQuantifier(p, i);
      i += q.consumed;
      result += "a".repeat(q.min === 0 ? 0 : q.min);
    } else {
      result += p[i++];
    }
  }

  return result || null;
}

function exampleForParam(param: OasParameter): string | null {
  if (param.example !== undefined) return String(param.example);
  const s = param.schema;
  if (!s) return null;
  if (s.example !== undefined) return String(s.example);
  if (s.default !== undefined) return String(s.default);
  if (s.enum && s.enum.length > 0) return String(s.enum[0]);
  if (s.pattern) {
    const v = tryExampleFromPattern(s.pattern);
    if (v) return v;
  }
  switch (s.type) {
    case "integer":
    case "number": return "1";
    case "boolean": return "true";
    case "string":
      switch (s.format) {
        case "uuid": return "00000000-0000-0000-0000-000000000001";
        case "email": return "user@example.com";
        case "date": return "2024-01-01";
        case "date-time": return "2024-01-01T00:00:00Z";
        case "uri": return "https://example.com";
        default: return null;
      }
    default: return null;
  }
}

function substitutePathParams(url: string, params: OasParameter[]): { url: string; missing: string[] } {
  const missing: string[] = [];
  let result = url;
  for (const match of [...url.matchAll(/\{([^}]+)\}/g)]) {
    const name = match[1];
    const param = params.find((p) => p.name === name && p.in === "path");
    const value = param ? exampleForParam(param) : null;
    if (value !== null) {
      result = result.replace(`{${name}}`, encodeURIComponent(value));
    } else {
      missing.push(name);
    }
  }
  return { url: result, missing };
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
    const pathLevelParams: OasParameter[] = (pathItem.parameters ?? []) as OasParameter[];

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const hasPaymentInfo = "x-payment-info" in op;
      const has402 = op.responses && "402" in op.responses;

      // Merge parameters: operation-level overrides path-level by name+in
      const opParams: OasParameter[] = (op.parameters ?? []) as OasParameter[];
      const merged = [...pathLevelParams];
      for (const p of opParams) {
        const idx = merged.findIndex((m) => m.name === p.name && m.in === p.in);
        if (idx >= 0) merged[idx] = p; else merged.push(p);
      }
      const pathParams = merged.filter((p) => p.in === "path");

      const endpoint: DiscoveredEndpoint = {
        path,
        method: method.toUpperCase(),
        summary: op.summary,
        fullUrl: `${serverBase}${path}`,
        tags: op.tags,
        pathParams,
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

  // Substitute path parameters before fetching
  const hasPlaceholders = /\{[^}]+\}/.test(endpoint.fullUrl);
  let fetchUrl = endpoint.fullUrl;
  let missingParams: string[] = [];
  if (hasPlaceholders) {
    const sub = substitutePathParams(endpoint.fullUrl, endpoint.pathParams ?? []);
    fetchUrl = sub.url;
    missingParams = sub.missing;
    if (missingParams.length > 0) {
      checks.push({
        id: "path_params",
        label: "Path parameters",
        status: "warn",
        detail: `${missingParams.map((n) => `{${n}}`).join(", ")} could not be substituted — add \`example\` values to your OpenAPI spec for accurate testing`,
      });
    }
  }

  const { res, error } = await safeFetch(fetchUrl, { method: endpoint.method });

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
    const hint = res.status === 400 && missingParams.length > 0
      ? ` — path parameter(s) ${missingParams.map((n) => `{${n}}`).join(", ")} had no example in spec; the API may have rejected the request before reaching payment middleware`
      : "";
    checks.push({
      id: "402",
      label: "Returns 402 without payment",
      status: "fail",
      detail: `Expected 402 but got ${res.status}${hint}`,
    });
    // No point inspecting payment headers if there's no 402
    return { ...endpoint, checks };
  }

  // Check 2: MPP payment challenge (WWW-Authenticate: Payment ...)
  const wwwAuth = res.headers.get("www-authenticate") ?? "";
  if (wwwAuth) {
    if (/^Payment\s/i.test(wwwAuth)) {
      try {
        const challenges = Challenge.deserializeList(wwwAuth);
        if (challenges.length > 0) {
          const c = challenges[0];
          const methods = [...new Set(challenges.map((ch) => ch.method))].join(", ");
          checks.push({
            id: "mpp_challenge",
            label: "MPP payment challenge",
            status: "pass",
            detail: `method=${methods}, realm="${c.realm}", intent="${c.intent}"`,
            data: challenges.length === 1 ? c : challenges,
          });
        } else {
          checks.push({
            id: "mpp_challenge",
            label: "MPP payment challenge",
            status: "warn",
            detail: "WWW-Authenticate: Payment header found but no challenges parsed",
          });
        }
      } catch (e) {
        checks.push({
          id: "mpp_challenge",
          label: "MPP payment challenge",
          status: "warn",
          detail: `WWW-Authenticate: Payment header invalid: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)}`,
        });
      }
    } else {
      checks.push({
        id: "mpp_challenge",
        label: "MPP payment challenge",
        status: "skip",
        detail: "WWW-Authenticate present but not MPP Payment scheme",
      });
    }
  } else {
    checks.push({
      id: "mpp_challenge",
      label: "MPP payment challenge",
      status: "skip",
      detail: "No WWW-Authenticate: Payment header",
    });
  }

  // Check 3: x402 payment challenge (PAYMENT-REQUIRED or X-Payment-Required)
  const paymentRequiredRaw =
    res.headers.get("payment-required") ??
    res.headers.get("x-payment-required") ??
    "";
  const paymentSignaturePresent = !!(res.headers.get("payment-signature") ?? res.headers.get("x-payment"));
  let decodedPayload: unknown = null;

  if (paymentRequiredRaw) {
    let schemaError: string | null = null;
    let x402Decoded: unknown = null;
    try {
      x402Decoded = x402.Header.decodePaymentRequired(paymentRequiredRaw);
      decodedPayload = x402Decoded;
    } catch (e) {
      schemaError = e instanceof Error ? e.message : String(e);
      decodedPayload = rawDecodeBase64Json(paymentRequiredRaw);
    }
    const headerName = res.headers.get("payment-required") ? "PAYMENT-REQUIRED" : "X-Payment-Required";
    checks.push({
      id: "x402_challenge",
      label: "x402 payment challenge",
      status: schemaError ? "warn" : "pass",
      detail: schemaError
        ? `${headerName} header present but failed schema validation: ${schemaError.slice(0, 100)}`
        : `${headerName} with valid x402 v${(x402Decoded as { x402Version?: number })?.x402Version ?? "?"} payload`,
      data: x402Decoded ?? undefined,
    });
  } else {
    const hint = paymentSignaturePresent ? " (PAYMENT-SIGNATURE or X-Payment header found — may indicate partial x402 support)" : "";
    checks.push({
      id: "x402_challenge",
      label: "x402 payment challenge",
      status: "warn",
      detail: `No PAYMENT-REQUIRED or X-Payment-Required header on 402${hint}`,
    });
  }

  // Check 4: accepted assets — mainnet USDC + network names + testnet detection
  if (decodedPayload !== null) {
    const assets = extractAcceptedAssets(decodedPayload);

    if (assets.length === 0) {
      checks.push({
        id: "payment_assets",
        label: "Accepted assets",
        status: "warn",
        detail: "No asset/network pairs found in payment payload",
      });
    } else {
      const mainnetUsdc = assets.filter((a) => a.isMainnetUsdc);
      const testnet = assets.filter((a) => a.isTestnet);
      const unknown = assets.filter((a) => !a.isMainnetUsdc && !a.isTestnet);

      const usdcNetworks = [...new Set(mainnetUsdc.map((a) => a.networkName))];
      const testnetNames = [...new Set(testnet.map((a) => a.tokenName ?? a.asset))];
      const unknownDesc = unknown.map((a) => `${a.asset.slice(0, 10)}… on ${a.networkName}`);

      if (mainnetUsdc.length === 0) {
        const foundParts: string[] = [];
        if (testnet.length > 0) foundParts.push(`testnet tokens (${testnetNames.join(", ")})`);
        if (unknown.length > 0) foundParts.push(`unrecognised (${unknownDesc.join(", ")})`);
        checks.push({
          id: "payment_assets",
          label: "Accepted assets",
          status: "fail",
          detail: `No mainnet USDC found. Accepted: ${foundParts.join("; ") || assets.map((a) => a.asset).join(", ")}`,
          data: assets,
        });
      } else if (testnet.length > 0) {
        checks.push({
          id: "payment_assets",
          label: "Accepted assets",
          status: "warn",
          detail: `USDC on ${usdcNetworks.join(", ")} ✓ — also accepts testnet tokens (${testnetNames.join(", ")}), which can confuse agents in production`,
          data: assets,
        });
      } else {
        const extras = unknown.length > 0 ? ` · also: ${unknownDesc.join(", ")}` : "";
        checks.push({
          id: "payment_assets",
          label: "Accepted assets",
          status: "pass",
          detail: `USDC on ${usdcNetworks.join(", ")}${extras}`,
          data: assets,
        });
      }
    }
  } else {
    checks.push({
      id: "payment_assets",
      label: "Accepted assets",
      status: "skip",
      detail: "Skipped — no decoded payload to inspect",
    });
  }

  return { ...endpoint, checks };
}

// ── Main service ─────────────────────────────────────────────────────────────

export async function runDoctorCheck({ url }: { url: string }): Promise<CheckResponse> {
  const targetUrl = new URL(url).toString();
  const origin = originOf(targetUrl);
  const baseChecks: CheckResult[] = [];

  // ── Base check 1: openapi.json ────────────────────────────────────────────
  const openapiCandidates = [
    resolveUrl(origin, "openapi.json"),
    resolveUrl(origin, "api/openapi.json"),
  ];
  let spec: OasSpec | null = null;
  let specTitle: string | undefined;

  {
    let foundUrl: string | null = null;
    let foundRes: Response | null = null;
    let fetchError: string | null = null;

    for (const candidate of openapiCandidates) {
      const { res, error } = await safeFetch(candidate);
      if (error) { fetchError = error; continue; }
      if (res?.status === 200) { foundUrl = candidate; foundRes = res; break; }
    }

    if (!foundUrl || !foundRes) {
      baseChecks.push({
        id: "openapi_json",
        label: "openapi.json (MPP discovery)",
        status: "fail",
        detail: fetchError ?? `Not found at ${openapiCandidates.join(" or ")}`,
      });
    } else {
      let parseError: string | null = null;
      try {
        spec = JSON.parse(await foundRes.text()) as OasSpec;
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
      }
      const pathLabel = foundUrl !== openapiCandidates[0] ? ` (at ${new URL(foundUrl).pathname})` : "";
      if (parseError || !spec) {
        baseChecks.push({
          id: "openapi_json",
          label: "openapi.json (MPP discovery)",
          status: "warn",
          detail: `Found${pathLabel} but not valid JSON: ${parseError}`,
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
            ? `OpenAPI ${spec.openapi ?? spec.swagger}${pathLabel}${hasPaymentInfo ? " · x-payment-info extension found" : " · no x-payment-info extension"}`
            : `Found${pathLabel} but missing 'openapi' field`,
          data: { info: spec.info, servers: spec.servers, pathCount: Object.keys(spec.paths ?? {}).length },
        });
      }
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

  const scan: DoctorScanResult = {
    url: targetUrl,
    baseChecks,
    specTitle,
    totalEndpoints,
    endpoints,
    testedAt: new Date().toISOString(),
  };

  return analyzeDoctorCheck(scan);
}
