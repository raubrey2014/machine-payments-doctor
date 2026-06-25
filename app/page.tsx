"use client";

import { useState, useRef } from "react";
import type { CheckResponse, CheckResult, CheckStatus, EndpointResult } from "./api/check/route";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CheckStatus, { icon: string; color: string; bg: string; border: string }> = {
  pass: { icon: "✓", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800" },
  fail: { icon: "✗", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800" },
  warn: { icon: "⚠", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800" },
  skip: { icon: "–", color: "text-zinc-400 dark:text-zinc-500", bg: "bg-zinc-50 dark:bg-zinc-900/40", border: "border-zinc-200 dark:border-zinc-700" },
};

function worstStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.some((c) => c.status === "pass")) return "pass";
  return "skip";
}

function scoreChecks(checks: CheckResult[]): number {
  const applicable = checks.filter((c) => c.status !== "skip");
  if (!applicable.length) return 0;
  const pts = applicable.reduce((s, c) => s + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return Math.round((pts / applicable.length) * 100);
}

function letterGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeColors(score: number) {
  if (score >= 80) return { text: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-400", bar: "bg-emerald-500" };
  if (score >= 60) return { text: "text-amber-600 dark:text-amber-400", ring: "border-amber-400", bar: "bg-amber-400" };
  return { text: "text-red-600 dark:text-red-400", ring: "border-red-400", bar: "bg-red-500" };
}

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "discovery", label: "Discovery", description: "Can agents find and understand your service?", weight: 0.33, baseIds: ["openapi_json", "llms_txt", "agent_card"], epIds: [] as string[] },
  { id: "protocol", label: "Protocol", description: "Does the x402 payment flow work correctly?", weight: 0.50, baseIds: [] as string[], epIds: ["402", "x402_header", "payment_assets"] },
  { id: "accessibility", label: "Accessibility", description: "Can agents reach your API cross-origin?", weight: 0.17, baseIds: ["cors"], epIds: [] as string[] },
] as const;

function getCategoryChecks(cat: typeof CATEGORIES[number], result: CheckResponse) {
  return [
    ...result.baseChecks.filter((c) => (cat.baseIds as readonly string[]).includes(c.id)),
    ...result.endpoints.flatMap((ep) => ep.checks.filter((c) => (cat.epIds as readonly string[]).includes(c.id))),
  ];
}

function overallScore(result: CheckResponse) {
  return Math.round(CATEGORIES.reduce((sum, cat) => sum + scoreChecks(getCategoryChecks(cat, result)) * cat.weight, 0));
}

// ── Result components ─────────────────────────────────────────────────────────

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[check.status];
  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button onClick={() => check.data !== undefined && setOpen((v) => !v)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${check.data !== undefined ? "cursor-pointer" : "cursor-default"}`}>
        <span className={`text-sm font-bold shrink-0 w-4 text-center ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{check.label}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2 break-all">{check.detail}</span>
        </div>
        {check.data !== undefined && <span className="text-zinc-400 text-xs shrink-0">{open ? "▴" : "▾"}</span>}
      </button>
      {open && check.data !== undefined && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
          <pre className="text-xs text-zinc-600 dark:text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(check.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function EndpointRow({ ep }: { ep: EndpointResult }) {
  const [open, setOpen] = useState(false);
  const worst = worstStatus(ep.checks);
  const cfg = STATUS_CONFIG[worst];
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition">
        <span className={`text-sm font-bold shrink-0 w-4 text-center ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase shrink-0">{ep.method}</span>
          <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">{ep.path}</code>
          {ep.summary && <span className="text-xs text-zinc-400 truncate hidden sm:inline">— {ep.summary}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ep.checks.map((c) => (
            <span key={c.id} className={`text-xs font-bold ${STATUS_CONFIG[c.status].color}`}>{STATUS_CONFIG[c.status].icon}</span>
          ))}
          <span className="text-zinc-300 dark:text-zinc-600 text-xs ml-1">{open ? "▴" : "▾"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 pt-1 pb-3 space-y-1.5 bg-zinc-50/60 dark:bg-zinc-900/40">
          <p className="text-xs font-mono text-zinc-400 py-1.5 break-all">{ep.fullUrl}</p>
          {ep.checks.map((c) => <CheckRow key={c.id} check={c} />)}
        </div>
      )}
    </div>
  );
}

function CategorySection({ cat, result }: { cat: typeof CATEGORIES[number]; result: CheckResponse }) {
  const checks = getCategoryChecks(cat, result);
  const score = scoreChecks(checks);
  const baseChecks = result.baseChecks.filter((c) => (cat.baseIds as readonly string[]).includes(c.id));
  const hasEndpoints = cat.epIds.length > 0;
  const { text } = gradeColors(score);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">{cat.label}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{cat.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xl font-bold tabular-nums ${text}`}>{score}%</span>
          <span className={`font-bold text-sm px-2 py-0.5 rounded-full border ${gradeColors(score).ring} ${text}`}>{letterGrade(score)}</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {baseChecks.map((c) => <CheckRow key={c.id} check={c} />)}
        {hasEndpoints && result.endpoints.length > 0 && (
          <>
            <p className="text-xs text-zinc-400 pt-1 pb-0.5">
              {result.endpoints.length} endpoint{result.endpoints.length !== 1 ? "s" : ""} tested
              {result.totalEndpoints > result.endpoints.length && ` of ${result.totalEndpoints} in spec`}
            </p>
            {result.endpoints.map((ep) => <EndpointRow key={`${ep.method}:${ep.path}`} ep={ep} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ── Score mockup (landing page illustration) ──────────────────────────────────

function ScoreMockup() {
  const cats = [
    { label: "Discovery", score: 67, weight: "33%" },
    { label: "Protocol", score: 100, weight: "50%" },
    { label: "Accessibility", score: 100, weight: "17%" },
  ];
  const overall = 89;
  const { text, ring } = gradeColors(overall);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl p-6 w-full max-w-sm select-none">
      {/* Score header */}
      <div className="flex items-center gap-5 mb-6">
        <div className={`w-20 h-20 rounded-full border-4 ${ring} flex flex-col items-center justify-center shrink-0`}>
          <span className={`text-3xl font-extrabold leading-none ${text}`}>{letterGrade(overall)}</span>
          <span className="text-[10px] text-zinc-400 mt-0.5">{overall}/100</span>
        </div>
        <div>
          <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200">api.example.com</div>
          <div className="text-xs text-zinc-400 mt-0.5">12 endpoints discovered</div>
          <div className="text-xs text-zinc-400">via openapi.json</div>
        </div>
      </div>
      {/* Category bars */}
      <div className="space-y-3">
        {cats.map((cat) => {
          const c = gradeColors(cat.score);
          return (
            <div key={cat.label} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{cat.label}</div>
                <div className="text-[10px] text-zinc-400">{cat.weight} weight</div>
              </div>
              <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
              </div>
              <span className={`text-xs font-bold w-8 text-right tabular-nums shrink-0 ${c.text}`}>{cat.score}%</span>
            </div>
          );
        })}
      </div>
      {/* Check rows preview */}
      <div className="mt-5 space-y-1.5">
        {[
          { icon: "✓", color: "text-emerald-500", label: "openapi.json", detail: "OpenAPI 3.1.0 · x-payment-info found" },
          { icon: "✓", color: "text-emerald-500", label: "llms.txt", detail: "298 lines" },
          { icon: "✗", color: "text-red-500", label: ".well-known/agent-card.json", detail: "Not found" },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg">
            <span className={`text-xs font-bold ${row.color} shrink-0`}>{row.icon}</span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{row.label}</span>
            <span className="text-[10px] text-zinc-400 truncate">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeCircle({ score }: { score: number }) {
  const { text, ring } = gradeColors(score);
  return (
    <div className={`w-24 h-24 rounded-full border-4 ${ring} flex flex-col items-center justify-center shrink-0`}>
      <span className={`text-3xl font-bold leading-none ${text}`}>{letterGrade(score)}</span>
      <span className="text-xs text-zinc-400 mt-0.5">{score}/100</span>
    </div>
  );
}

function CategoryBar({ label, weight, score }: { label: string; weight: number; score: number }) {
  const { text, ring, bar } = gradeColors(score);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{label}</div>
        <div className="text-xs text-zinc-400">{Math.round(weight * 100)}% weight</div>
      </div>
      <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <div className={`w-10 text-right text-sm font-semibold tabular-nums shrink-0 ${text}`}>{score}%</div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${ring} ${text}`}>{letterGrade(score)}</div>
    </div>
  );
}

function buildDoctorPrompt(result: CheckResponse): string {
  const overall = overallScore(result);
  const hostname = (() => { try { return new URL(result.url).hostname; } catch { return result.url; } })();
  const endpointList = result.endpoints.slice(0, 4)
    .map((e) => `  - ${e.method} ${e.fullUrl}${e.summary ? ` (${e.summary})` : ""}`)
    .join("\n");

  // Collect failing/warning checks across base and endpoints
  const issues: string[] = [];

  // Base check issues
  for (const c of result.baseChecks) {
    if (c.status === "fail") {
      if (c.id === "openapi_json") issues.push(`• No openapi.json found at ${result.url.replace(/\/$/, "")}/openapi.json\n  Fix: Expose a valid OpenAPI 3.1 spec with x-payment-info extensions on paid operations.`);
      if (c.id === "llms_txt") issues.push(`• No llms.txt found\n  Fix: Add a plain-text file at /llms.txt describing what your API does and how to use it.`);
      if (c.id === "agent_card") issues.push(`• No .well-known/agent-card.json found\n  Fix: Publish a JSON file at /.well-known/agent-card.json with at minimum { "name": "…", "url": "…" }.`);
      if (c.id === "cors") issues.push(`• CORS headers missing\n  Fix: Return Access-Control-Allow-Origin: * and allow the X-Payment and X-Payment-Required headers.`);
    } else if (c.status === "warn") {
      if (c.id === "openapi_json") issues.push(`• openapi.json found but missing x-payment-info extension\n  Fix: Add x-payment-info to each paid operation listing accepted networks/assets/amounts.`);
      if (c.id === "cors") issues.push(`• CORS configuration incomplete\n  Fix: ${c.detail}`);
    }
  }

  // Endpoint-level issues (deduplicated by check id)
  const seenEpIssues = new Set<string>();
  for (const ep of result.endpoints) {
    for (const c of ep.checks) {
      if ((c.status === "fail" || c.status === "warn") && !seenEpIssues.has(c.id)) {
        seenEpIssues.add(c.id);
        if (c.id === "402" && c.status === "fail") {
          issues.push(`• Endpoints not returning HTTP 402 without payment\n  Fix: Your middleware must intercept unauthenticated requests and respond 402 before fulfilling them.`);
        }
        if (c.id === "x402_header") {
          issues.push(`• X-Payment-Required header missing or malformed on 402 responses\n  Fix: On every 402, set X-Payment-Required to a base64-encoded JSON PaymentRequired object with an "accepts" array (see https://x402.org).`);
        }
        if (c.id === "payment_assets") {
          if (c.status === "fail") issues.push(`• Payment payload doesn't include mainnet USDC\n  Fix: ${c.detail}\n  Add USDC on Base (eip155:8453 / 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) or Solana (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v).`);
          if (c.status === "warn") issues.push(`• Testnet tokens included in production payment payload\n  Fix: ${c.detail}`);
        }
      }
    }
  }

  const issueSection = issues.length > 0
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        setError(body.error ?? "Request failed");
        return;
      }
      const data: CheckResponse = await res.json();
      setResult(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt() {
    if (!result) return;
    await navigator.clipboard.writeText(buildDoctorPrompt(result));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  const score = result ? overallScore(result) : 0;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center text-white font-bold text-[11px]">+</div>
            <span className="font-semibold text-sm">Machine Payments Doctor</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-400">
            <a href="https://mpp.dev" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition">mpp.dev ↗</a>
            <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition">x402.org ↗</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 text-xs font-medium text-violet-700 dark:text-violet-300 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
          x402 · MPP · ATXP
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
          Machine Payments<br />Doctor
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto">
          Diagnose your machine payments integration. Get a score, find gaps, and know exactly what AI agents see when they try to pay your API.
        </p>

        {/* Search */}
        <form onSubmit={runCheck} className="mt-8 flex gap-3 max-w-2xl mx-auto">
          <input
            type="url"
            required
            placeholder="https://api.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-5 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition shadow-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Checking…
              </span>
            ) : "Check →"}
          </button>
        </form>

        {error && (
          <div className="mt-4 max-w-2xl mx-auto bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
      </section>

      {/* Results */}
      {result && (
        <section ref={resultsRef} className="max-w-3xl mx-auto px-6 pb-20 space-y-5">
          {/* Score card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
            <div className="flex items-start gap-6 flex-wrap">
              <GradeCircle score={score} />
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">{result.specTitle ?? new URL(result.url).hostname}</h2>
                  <p className="text-xs font-mono text-zinc-400 mt-0.5 break-all">{result.url}</p>
                  {result.totalEndpoints > 0 && (
                    <p className="text-xs text-zinc-400 mt-1">{result.totalEndpoints} payment endpoints discovered via openapi.json</p>
                  )}
                </div>
                <div className="space-y-3">
                  {CATEGORIES.map((cat) => (
                    <CategoryBar
                      key={cat.id}
                      label={cat.label}
                      weight={cat.weight}
                      score={scoreChecks(getCategoryChecks(cat, result))}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Category sections */}
          {CATEGORIES.map((cat) => <CategorySection key={cat.id} cat={cat} result={result} />)}

          {/* Doctor prompt card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-sm">Doctor prompt</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Paste into Claude to run live x402 payment tests and get targeted fixes
                </p>
              </div>
              <button
                onClick={copyPrompt}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition shrink-0"
              >
                {promptCopied ? "✓ Copied!" : "Copy prompt"}
              </button>
            </div>
            <pre className="text-xs text-zinc-600 dark:text-zinc-400 p-5 overflow-auto max-h-80 whitespace-pre-wrap leading-relaxed font-mono">
              {buildDoctorPrompt(result)}
            </pre>
          </div>

          {/* Footer */}
          <div className="px-1 text-xs text-zinc-400">
            Tested {new Date(result.testedAt).toLocaleString()} ·{" "}
            <a href="https://mpp.dev/advanced/discovery" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">MPP discovery spec ↗</a>
          </div>
        </section>
      )}

      {/* Landing sections — only shown before a check */}
      {!result && !loading && (
        <>
          {/* Score section */}
          <section className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="max-w-5xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">Your score</p>
                <h2 className="text-3xl font-bold tracking-tight leading-snug">
                  Understand your integration health — get your score
                </h2>
                <p className="mt-4 text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Every service gets a single 0–100 grade across three dimensions. Know exactly what AI agents see when they discover and try to pay your API — before they do.
                </p>
                <ul className="mt-6 space-y-2">
                  {[
                    "Parses your openapi.json to find real endpoints",
                    "Tests 402 responses across discovered paths",
                    "Checks for mainnet vs. testnet asset confusion",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="text-violet-500 mt-0.5 shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-center md:justify-end">
                <ScoreMockup />
              </div>
            </div>
          </section>

          {/* Three pillars */}
          <section className="border-t border-zinc-100 dark:border-zinc-800">
            <div className="max-w-5xl mx-auto px-6 py-20">
              <div className="text-center mb-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">How we score</p>
                <h2 className="text-3xl font-bold tracking-tight">Three dimensions of health</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  {
                    label: "Discovery",
                    weight: "33%",
                    color: "border-violet-300 dark:border-violet-700",
                    accent: "text-violet-600 dark:text-violet-400",
                    dot: "bg-violet-500",
                    desc: "Can AI agents find, read, and authenticate your service before paying?",
                    checks: ["openapi.json with x-payment-info", "llms.txt for AI context", ".well-known/agent-card.json"],
                  },
                  {
                    label: "Protocol",
                    weight: "50%",
                    color: "border-violet-400 dark:border-violet-600",
                    accent: "text-violet-700 dark:text-violet-300",
                    dot: "bg-violet-600",
                    desc: "Does the x402 payment flow work correctly across your endpoints?",
                    checks: ["HTTP 402 without credentials", "X-Payment-Required header & payload", "Mainnet USDC accepted"],
                  },
                  {
                    label: "Accessibility",
                    weight: "17%",
                    color: "border-violet-200 dark:border-violet-800",
                    accent: "text-violet-500 dark:text-violet-400",
                    dot: "bg-violet-400",
                    desc: "Can browser-based and cross-origin agents reach your API?",
                    checks: ["CORS headers on all endpoints", "OPTIONS preflight support"],
                  },
                ].map((cat) => (
                  <div key={cat.label} className={`rounded-2xl border-2 ${cat.color} p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cat.dot}`} />
                        <span className="font-bold text-sm">{cat.label}</span>
                      </div>
                      <span className={`text-xs font-semibold ${cat.accent} bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-full`}>{cat.weight}</span>
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{cat.desc}</p>
                    <ul className="space-y-1.5">
                      {cat.checks.map((c) => (
                        <li key={c} className="text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-1.5">
                          <span className="text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5">›</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
