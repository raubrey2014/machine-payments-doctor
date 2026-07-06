import { validate as mppxValidate, buildUrl } from "mppx/validation";
import type { CheckResult as MppxCheckResult } from "mppx/validation";
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

// ── Mapping mppx results → doctor format ─────────────────────────────────────

function mapMppxSeverity(severity: MppxCheckResult["severity"]): CheckStatus {
  switch (severity) {
    case "pass": return "pass";
    case "fail": return "fail";
    case "warn": return "warn";
    case "skip": return "skip";
  }
}

// ── x402 endpoint enrichment ─────────────────────────────────────────────────
// For endpoints that mppx identified as non-MPP (x402), re-fetch to extract
// payment headers and do asset analysis.

async function enrichWithX402(fetchUrl: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const { res, error } = await safeFetch(fetchUrl);
  if (error || !res || res.status !== 402) return checks;

  // x402 payment challenge (PAYMENT-REQUIRED or X-Payment-Required)
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

  // Accepted assets — mainnet USDC + network names + testnet detection
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

  return checks;
}

// ── Main service ─────────────────────────────────────────────────────────────

export async function runDoctorCheck({ url }: { url: string }): Promise<CheckResponse> {
  const targetUrl = new URL(url).toString();
  const origin = originOf(targetUrl);

  // Run mppx validate (MPP protocol checks) and supplemental checks in parallel
  const [mppxResult, llmsResult, agentCardResult, corsResult] = await Promise.all([
    // mppx validate — handles discovery (tries /openapi.json then /api/openapi.json),
    // endpoint 402 checks, MPP challenge field validation, error handling, and x402 detection
    mppxValidate({
      url: origin,
      skipPayment: true,
    }),

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

  // ── Map mppx discovery → base checks ──────────────────────────────────────
  const baseChecks: CheckResult[] = [];
  const doc = mppxResult.discovery.doc as Record<string, unknown> | null;
  const specTitle = doc?.info ? (doc.info as Record<string, unknown>).title as string | undefined : undefined;

  if (mppxResult.discovery.found) {
    const hasPaymentInfo = doc ? JSON.stringify(doc).includes("x-payment-info") : false;
    const version = doc?.openapi ?? doc?.swagger ?? "unknown";
    const pathCount = doc?.paths ? Object.keys(doc.paths as object).length : 0;
    baseChecks.push({
      id: "openapi_json",
      label: "openapi.json (MPP discovery)",
      status: mppxResult.discovery.valid ? "pass" : "warn",
      detail: `OpenAPI ${version}${hasPaymentInfo ? " · x-payment-info extension found" : " · no x-payment-info extension"}`,
      data: { info: doc?.info, servers: doc?.servers, pathCount },
    });
  } else {
    const failCheck = mppxResult.discovery.checks.find((c) => c.severity === "fail");
    baseChecks.push({
      id: "openapi_json",
      label: "openapi.json (MPP discovery)",
      status: "fail",
      detail: failCheck?.detail ?? "Not found",
    });
  }

  baseChecks.push(llmsResult, agentCardResult, corsResult);

  // ── Map mppx endpoint results → doctor format ─────────────────────────────
  const endpoints: EndpointResult[] = [];

  // Match mppx endpoint results with their specs (for URL reconstruction)
  const endpointSpecs = mppxResult.discovery.endpoints;

  for (let i = 0; i < mppxResult.endpoints.length; i++) {
    const ep = mppxResult.endpoints[i];
    const spec = endpointSpecs[i];
    const fullUrl = spec ? buildUrl(mppxResult.url, spec) : `${mppxResult.url}${ep.path}`;
    const checks: CheckResult[] = [];

    // Map challenge results (includes 402 check, MPP challenge validation, x402 detection)
    const has402 = ep.challenge.some((c) => c.severity === "pass" && c.label === "Returns 402 without credentials");
    const isMpp = ep.challenge.some((c) => c.severity === "pass" && c.label === "Challenge parseable");
    const isX402 = ep.challenge.some((c) => c.label.includes("x402"));

    if (has402) {
      checks.push({ id: "402", label: "Returns 402 without payment", status: "pass", detail: "Got 402 Payment Required" });
    } else {
      const failResult = ep.challenge.find((c) => c.severity === "fail" && c.label === "Returns 402 without credentials");
      const skipResult = ep.challenge.find((c) => c.severity === "skip" && c.label === "Returns 402 without credentials");
      checks.push({
        id: "402",
        label: "Returns 402 without payment",
        status: failResult ? "fail" : skipResult ? "skip" : "fail",
        detail: failResult?.detail ?? skipResult?.detail ?? "Did not get 402",
      });
      if (!has402) {
        endpoints.push({ path: ep.path, method: ep.method, fullUrl, checks });
        continue;
      }
    }

    if (isMpp) {
      // MPP challenge — report the deep validation results from mppx
      const parseResult = ep.challenge.find((c) => c.label === "Challenge parseable");
      checks.push({
        id: "mpp_challenge",
        label: "MPP payment challenge",
        status: "pass",
        detail: parseResult?.detail ? `Validated: ${parseResult.detail}` : "Valid MPP challenge",
      });

      // Include deeper field-level checks from mppx as additional detail
      const fieldChecks = ep.challenge.filter((c) =>
        c.label !== "Returns 402 without credentials" &&
        c.label !== "WWW-Authenticate header present" &&
        c.label !== "Challenge parseable" &&
        c.label !== "Not an MPP endpoint"
      );
      for (const fc of fieldChecks) {
        checks.push({
          id: `mpp_${fc.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          label: fc.label,
          status: mapMppxSeverity(fc.severity),
          detail: fc.detail ?? "",
        });
      }

      // Include error handling results
      for (const eh of ep.errorHandling) {
        checks.push({
          id: `mpp_error_${eh.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          label: eh.label,
          status: mapMppxSeverity(eh.severity),
          detail: eh.detail ?? "",
        });
      }

      // MPP endpoints don't have x402 — skip those checks
      checks.push({ id: "x402_challenge", label: "x402 payment challenge", status: "skip", detail: "Endpoint uses MPP (WWW-Authenticate: Payment)" });
      checks.push({ id: "payment_assets", label: "Accepted assets", status: "skip", detail: "Skipped — MPP endpoint (assets encoded in challenge)" });
    } else if (isX402) {
      // x402 detected by mppx — re-fetch for deep asset analysis
      checks.push({ id: "mpp_challenge", label: "MPP payment challenge", status: "skip", detail: "No WWW-Authenticate: Payment header" });
      const x402Checks = await enrichWithX402(fullUrl);
      checks.push(...x402Checks);
    } else {
      // Neither MPP nor x402
      checks.push({ id: "mpp_challenge", label: "MPP payment challenge", status: "skip", detail: "No WWW-Authenticate: Payment header" });
      checks.push({ id: "x402_challenge", label: "x402 payment challenge", status: "warn", detail: "No payment headers found on 402 response" });
      checks.push({ id: "payment_assets", label: "Accepted assets", status: "skip", detail: "Skipped — no decoded payload to inspect" });
    }

    endpoints.push({ path: ep.path, method: ep.method, fullUrl, checks });
  }

  // If no endpoints were tested (no spec, no --endpoint), fall back to testing the target URL directly
  if (endpoints.length === 0) {
    const fallbackUrl = targetUrl;
    const fallbackChecks: CheckResult[] = [];
    const { res, error } = await safeFetch(fallbackUrl);
    if (error || !res) {
      fallbackChecks.push({ id: "402", label: "Returns 402 without payment", status: "fail", detail: error ?? "No response" });
    } else if (res.status === 402) {
      fallbackChecks.push({ id: "402", label: "Returns 402 without payment", status: "pass", detail: "Got 402 Payment Required" });
      const x402Checks = await enrichWithX402(fallbackUrl);
      fallbackChecks.push({ id: "mpp_challenge", label: "MPP payment challenge", status: "skip", detail: "No endpoint-specific MPP data" });
      fallbackChecks.push(...x402Checks);
    } else {
      fallbackChecks.push({ id: "402", label: "Returns 402 without payment", status: "fail", detail: `Expected 402 but got ${res.status}` });
    }
    endpoints.push({
      path: new URL(fallbackUrl).pathname || "/",
      method: "GET",
      fullUrl: fallbackUrl,
      checks: fallbackChecks,
    });
  }

  // Count total payment-marked endpoints from discovery doc
  const totalEndpoints = mppxResult.discovery.endpoints.length || endpoints.length;

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
