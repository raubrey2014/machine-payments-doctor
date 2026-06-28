import type {
  CategoryId,
  CategoryScore,
  CheckResponse,
  CheckResult,
  DoctorIssue,
  DoctorScanResult,
  EndpointResult,
  IssueSeverity,
} from "./doctor-types";

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
    description: "Does the payment challenge work correctly?",
    weight: 0.5,
    baseIds: [] as string[],
    epIds: ["402", "mpp_challenge", "x402_challenge", "payment_assets"] as string[],
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

export type CategoryDefinition = (typeof CATEGORIES)[number];

export function getCategoryChecks(cat: CategoryDefinition, result: DoctorScanResult): CheckResult[] {
  return [
    ...result.baseChecks.filter((c) => cat.baseIds.includes(c.id)),
    ...result.endpoints.flatMap((ep) => ep.checks.filter((c) => cat.epIds.includes(c.id))),
  ];
}

export function scoreChecks(checks: CheckResult[]): number {
  const applicable = checks.filter((c) => c.status !== "skip");
  if (!applicable.length) return 0;

  const points = applicable.reduce(
    (sum, check) => sum + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
    0
  );
  return Math.round((points / applicable.length) * 100);
}

export function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function buildCategoryScores(result: DoctorScanResult): CategoryScore[] {
  return CATEGORIES.map((cat) => {
    const score = scoreChecks(getCategoryChecks(cat, result));
    return {
      id: cat.id,
      label: cat.label,
      description: cat.description,
      weight: cat.weight,
      score,
      grade: letterGrade(score),
    };
  });
}

export function overallScore(categories: CategoryScore[]): number {
  return Math.round(
    categories.reduce((sum, category) => sum + category.score * category.weight, 0)
  );
}

export function analyzeDoctorCheck(scan: DoctorScanResult): CheckResponse {
  const categories = buildCategoryScores(scan);
  const score = overallScore(categories);
  const responseWithoutPrompt = {
    ...scan,
    score,
    grade: letterGrade(score),
    categories,
    issues: buildIssues(scan),
    doctorPrompt: "",
  };

  return {
    ...responseWithoutPrompt,
    doctorPrompt: buildDoctorPrompt(responseWithoutPrompt),
  };
}

function issueFromCheck(args: {
  id: string;
  category: CategoryId;
  severity: IssueSeverity;
  title: string;
  detail: string;
  fix: string;
  check: CheckResult;
  endpoint?: EndpointResult;
}): DoctorIssue {
  return {
    id: args.id,
    category: args.category,
    severity: args.severity,
    title: args.title,
    detail: args.detail,
    fix: args.fix,
    checkId: args.check.id,
    endpoint: args.endpoint
      ? {
          method: args.endpoint.method,
          path: args.endpoint.path,
          fullUrl: args.endpoint.fullUrl,
        }
      : undefined,
  };
}

export function buildIssues(result: DoctorScanResult): DoctorIssue[] {
  const issues: DoctorIssue[] = [];

  for (const check of result.baseChecks) {
    if (check.status === "fail") {
      if (check.id === "openapi_json") {
        issues.push(issueFromCheck({
          id: "discovery.openapi_json_missing",
          category: "discovery",
          severity: "error",
          title: "No openapi.json found",
          detail: check.detail,
          fix: "Expose a valid OpenAPI 3.1 spec at /openapi.json with x-payment-info extensions on paid operations.",
          check,
        }));
      }
      if (check.id === "llms_txt") {
        issues.push(issueFromCheck({
          id: "discovery.llms_txt_missing",
          category: "discovery",
          severity: "error",
          title: "No llms.txt found",
          detail: check.detail,
          fix: "Add a plain-text file at /llms.txt describing your API and how to use it.",
          check,
        }));
      }
      if (check.id === "agent_card") {
        issues.push(issueFromCheck({
          id: "discovery.agent_card_missing",
          category: "discovery",
          severity: "error",
          title: "No .well-known/agent-card.json found",
          detail: check.detail,
          fix: 'Publish a JSON file at /.well-known/agent-card.json with at minimum { "name": "...", "url": "..." }.',
          check,
        }));
      }
      if (check.id === "cors") {
        issues.push(issueFromCheck({
          id: "accessibility.cors_missing",
          category: "accessibility",
          severity: "error",
          title: "CORS headers missing",
          detail: check.detail,
          fix: "Return Access-Control-Allow-Origin: * and allow X-Payment and X-Payment-Required headers.",
          check,
        }));
      }
    }

    if (check.status === "warn") {
      if (check.id === "openapi_json") {
        issues.push(issueFromCheck({
          id: "discovery.openapi_json_incomplete",
          category: "discovery",
          severity: "warning",
          title: "openapi.json is incomplete",
          detail: check.detail,
          fix: "Add x-payment-info to each paid operation listing accepted networks, assets, and amounts.",
          check,
        }));
      }
      if (check.id === "cors") {
        issues.push(issueFromCheck({
          id: "accessibility.cors_incomplete",
          category: "accessibility",
          severity: "warning",
          title: "CORS configuration incomplete",
          detail: check.detail,
          fix: check.detail,
          check,
        }));
      }
    }
  }

  const seenEndpointIssues = new Set<string>();
  for (const endpoint of result.endpoints) {
    for (const check of endpoint.checks) {
      const seenKey = `${check.id}:${check.status}`;
      if ((check.status !== "fail" && check.status !== "warn") || seenEndpointIssues.has(seenKey)) {
        continue;
      }

      if (check.id === "402" && check.status === "fail") {
        seenEndpointIssues.add(seenKey);
        issues.push(issueFromCheck({
          id: "protocol.missing_402",
          category: "protocol",
          severity: "error",
          title: "Endpoints do not return HTTP 402 without payment",
          detail: check.detail,
          fix: "Your middleware must intercept unauthenticated requests and respond 402 before fulfilling them.",
          check,
          endpoint,
        }));
      }
      if (check.id === "mpp_challenge" && check.status === "warn") {
        seenEndpointIssues.add(seenKey);
        issues.push(issueFromCheck({
          id: "protocol.mpp_challenge_malformed",
          category: "protocol",
          severity: "warning",
          title: "WWW-Authenticate: Payment header malformed",
          detail: check.detail,
          fix: "On every 402, set WWW-Authenticate to a valid MPP Payment challenge: 'Payment id=\"...\", realm=\"...\", method=\"...\", intent=\"...\", request=\"<base64url>\"'.",
          check,
          endpoint,
        }));
      }
      if (check.id === "x402_challenge") {
        seenEndpointIssues.add(seenKey);
        issues.push(issueFromCheck({
          id: "protocol.x402_challenge_missing_or_malformed",
          category: "protocol",
          severity: check.status === "fail" ? "error" : "warning",
          title: check.detail.includes("failed schema")
            ? "PAYMENT-REQUIRED header schema invalid"
            : "PAYMENT-REQUIRED header missing",
          detail: check.detail,
          fix: "On every 402, set PAYMENT-REQUIRED to a base64-encoded x402 v2 PaymentRequired JSON object with an \"accepts\" array.",
          check,
          endpoint,
        }));
      }
      if (check.id === "payment_assets") {
        seenEndpointIssues.add(seenKey);
        issues.push(issueFromCheck({
          id: check.status === "fail" ? "protocol.mainnet_usdc_missing" : "protocol.testnet_tokens_included",
          category: "protocol",
          severity: check.status === "fail" ? "error" : "warning",
          title: check.status === "fail"
            ? "Payment payload does not include mainnet USDC"
            : "Testnet tokens included in production payment payload",
          detail: check.detail,
          fix: check.status === "fail"
            ? "Add USDC on Base (eip155:8453 / 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) or Solana (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)."
            : check.detail,
          check,
          endpoint,
        }));
      }
    }
  }

  return issues;
}

export function buildDoctorPrompt(result: CheckResponse): string {
  const hostname = (() => {
    try {
      return new URL(result.url).hostname;
    } catch {
      return result.url;
    }
  })();
  const endpointList = result.endpoints
    .slice(0, 4)
    .map((endpoint) => `  - ${endpoint.method} ${endpoint.fullUrl}${endpoint.summary ? ` (${endpoint.summary})` : ""}`)
    .join("\n");

  const issueSection =
    result.issues.length > 0
      ? `\n## Issues found (score: ${result.score}/100)\n\n${result.issues
          .map((issue) => `• ${issue.title}\n  Fix: ${issue.fix}`)
          .join("\n\n")}`
      : `\n## This service scored ${result.score}/100 - no major issues found.`;

  return `# Machine Payments Doctor - ${hostname}

This is a set of improvements to make your machine payments integration more standard, powered by https://machine-payments-doctor.vercel.app/; you can see your results at https://machine-payments-doctor.vercel.app/eval/${hostname}
${issueSection}

## Live payment test

Base URL: ${result.url}

Endpoints to test:
${endpointList || `  - GET ${result.url}`}

For each endpoint above:

1. Make a ${result.endpoints[0]?.method ?? "GET"} request with no credentials.
   Confirm the response is HTTP 402.
   Read and base64-decode the X-Payment-Required header.
   Print the full "accepts" array - show network, asset, amount, payTo.

2. Choose the USDC option (prefer Base or Solana).
   Construct a PaymentPayload for that option.
   Show the full JSON before encoding, then base64-encode it.

3. Retry the request with header: X-Payment: <base64-payload>
   Confirm the response is 2xx.
   Print the X-Payment-Response header and the first 500 chars of the body.

4. Summarise: which network was used, what the cost was, whether it succeeded.

Reference: https://mpp.dev/advanced/discovery`.trim();
}
