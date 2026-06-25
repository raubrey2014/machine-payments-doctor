import type { CheckResult, CheckResponse, EndpointResult } from "../api/check/route";

export const CATEGORIES = [
  {
    id: "discovery",
    label: "Discovery",
    description: "Can agents find and understand your service?",
    weight: 0.33,
    baseIds: ["openapi_json", "llms_txt", "agent_card"] as string[],
    epIds: [] as string[],
  },
  {
    id: "protocol",
    label: "Protocol",
    description: "Does the x402 payment flow work correctly?",
    weight: 0.50,
    baseIds: [] as string[],
    epIds: ["402", "x402_header", "payment_assets"] as string[],
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "Can agents reach your API cross-origin?",
    weight: 0.17,
    baseIds: ["cors"] as string[],
    epIds: [] as string[],
  },
] as const;

export type Category = typeof CATEGORIES[number];

export function getCategoryChecks(cat: Category, result: CheckResponse): CheckResult[] {
  return [
    ...result.baseChecks.filter((c) => cat.baseIds.includes(c.id)),
    ...result.endpoints.flatMap((ep) => ep.checks.filter((c) => cat.epIds.includes(c.id))),
  ];
}

export function scoreChecks(checks: CheckResult[]): number {
  const applicable = checks.filter((c) => c.status !== "skip");
  if (!applicable.length) return 0;
  const pts = applicable.reduce(
    (s, c) => s + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0),
    0
  );
  return Math.round((pts / applicable.length) * 100);
}

export function overallScore(result: CheckResponse): number {
  return Math.round(
    CATEGORIES.reduce(
      (sum, cat) => sum + scoreChecks(getCategoryChecks(cat, result)) * cat.weight,
      0
    )
  );
}

export function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function gradeColors(score: number) {
  if (score >= 80)
    return { text: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-400", bar: "bg-emerald-500" };
  if (score >= 60)
    return { text: "text-amber-600 dark:text-amber-400", ring: "border-amber-400", bar: "bg-amber-400" };
  return { text: "text-red-600 dark:text-red-400", ring: "border-red-400", bar: "bg-red-500" };
}

export function buildDoctorPrompt(result: CheckResponse): string {
  const overall = overallScore(result);
  const hostname = (() => {
    try { return new URL(result.url).hostname; } catch { return result.url; }
  })();
  const endpointList = result.endpoints
    .slice(0, 4)
    .map((e) => `  - ${e.method} ${e.fullUrl}${e.summary ? ` (${e.summary})` : ""}`)
    .join("\n");

  const issues: string[] = [];

  for (const c of result.baseChecks) {
    if (c.status === "fail") {
      if (c.id === "openapi_json")
        issues.push(`• No openapi.json found\n  Fix: Expose a valid OpenAPI 3.1 spec at /openapi.json with x-payment-info extensions on paid operations.`);
      if (c.id === "llms_txt")
        issues.push(`• No llms.txt found\n  Fix: Add a plain-text file at /llms.txt describing your API and how to use it.`);
      if (c.id === "agent_card")
        issues.push(`• No .well-known/agent-card.json found\n  Fix: Publish a JSON file at /.well-known/agent-card.json with at minimum { "name": "…", "url": "…" }.`);
      if (c.id === "cors")
        issues.push(`• CORS headers missing\n  Fix: Return Access-Control-Allow-Origin: * and allow X-Payment and X-Payment-Required headers.`);
    } else if (c.status === "warn") {
      if (c.id === "openapi_json")
        issues.push(`• openapi.json missing x-payment-info extension\n  Fix: Add x-payment-info to each paid operation listing accepted networks/assets/amounts.`);
      if (c.id === "cors")
        issues.push(`• CORS configuration incomplete\n  Fix: ${c.detail}`);
    }
  }

  const seenEpIssues = new Set<string>();
  for (const ep of result.endpoints) {
    for (const c of ep.checks) {
      if ((c.status === "fail" || c.status === "warn") && !seenEpIssues.has(c.id)) {
        seenEpIssues.add(c.id);
        if (c.id === "402" && c.status === "fail")
          issues.push(`• Endpoints not returning HTTP 402 without payment\n  Fix: Your middleware must intercept unauthenticated requests and respond 402 before fulfilling them.`);
        if (c.id === "x402_header")
          issues.push(`• X-Payment-Required header missing or malformed\n  Fix: On every 402, set X-Payment-Required to a base64-encoded JSON PaymentRequired object with an "accepts" array (see https://x402.org).`);
        if (c.id === "payment_assets") {
          if (c.status === "fail")
            issues.push(`• Payment payload doesn't include mainnet USDC\n  Fix: ${c.detail}\n  Add USDC on Base (eip155:8453 / 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) or Solana (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v).`);
          if (c.status === "warn")
            issues.push(`• Testnet tokens included in production payment payload\n  Fix: ${c.detail}`);
        }
      }
    }
  }

  const issueSection =
    issues.length > 0
      ? `\n## Issues found (score: ${overall}/100)\n\n${issues.join("\n\n")}`
      : `\n## This service scored ${overall}/100 — no major issues found.`;

  return `# Machine Payments Doctor — ${hostname}
${issueSection}

## Live payment test

Base URL: ${result.url}

Endpoints to test:
${endpointList || `  - GET ${result.url}`}

For each endpoint above:

1. Make a ${result.endpoints[0]?.method ?? "GET"} request with no credentials.
   Confirm the response is HTTP 402.
   Read and base64-decode the X-Payment-Required header.
   Print the full "accepts" array — show network, asset, amount, payTo.

2. Choose the USDC option (prefer Base or Solana).
   Construct a PaymentPayload for that option.
   Show the full JSON before encoding, then base64-encode it.

3. Retry the request with header: X-Payment: <base64-payload>
   Confirm the response is 2xx.
   Print the X-Payment-Response header and the first 500 chars of the body.

4. Summarise: which network was used, what the cost was, whether it succeeded.

Reference: https://mpp.dev/advanced/discovery`.trim();
}

export type { CheckResult, CheckResponse, EndpointResult };
