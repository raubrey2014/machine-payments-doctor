"use client";

import { useState, useRef } from "react";
import type { CheckResponse, CheckResult, CheckStatus, EndpointResult } from "./api/check/route";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CheckStatus, { icon: string; color: string; bg: string; border: string }> = {
  pass: {
    icon: "✓",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  fail: {
    icon: "✗",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800",
  },
  warn: {
    icon: "⚠",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
  },
  skip: {
    icon: "–",
    color: "text-zinc-400 dark:text-zinc-500",
    bg: "bg-zinc-50 dark:bg-zinc-900/40",
    border: "border-zinc-200 dark:border-zinc-700",
  },
};

function worstStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.some((c) => c.status === "pass")) return "pass";
  return "skip";
}

function scoreChecks(checks: CheckResult[]): { score: number; total: number } {
  const applicable = checks.filter((c) => c.status !== "skip");
  const passed = applicable.filter((c) => c.status === "pass").length;
  // Warnings count as half-credit
  const warned = applicable.filter((c) => c.status === "warn").length;
  const score = applicable.length === 0 ? 0 : Math.round(((passed + warned * 0.5) / applicable.length) * 100);
  return { score, total: applicable.length };
}

function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeColor(score: number) {
  if (score >= 80) return { text: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-400 dark:border-emerald-600" };
  if (score >= 60) return { text: "text-amber-600 dark:text-amber-400", ring: "border-amber-400 dark:border-amber-600" };
  return { text: "text-red-600 dark:text-red-400", ring: "border-red-400 dark:border-red-600" };
}

// ── Category scoring ──────────────────────────────────────────────────────────

interface Category {
  id: string;
  label: string;
  description: string;
  weight: number; // 0–1
  baseCheckIds: string[];
  endpointCheckIds: string[];
}

const CATEGORIES: Category[] = [
  {
    id: "discovery",
    label: "Discovery",
    description: "Can agents find, understand, and authenticate your service?",
    weight: 0.33,
    baseCheckIds: ["openapi_json", "llms_txt", "agent_card"],
    endpointCheckIds: [],
  },
  {
    id: "protocol",
    label: "Protocol",
    description: "Does the x402 payment flow work correctly across endpoints?",
    weight: 0.50,
    baseCheckIds: [],
    endpointCheckIds: ["402", "x402_header", "payment_assets"],
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "Is the service reachable from browser-based and cross-origin agents?",
    weight: 0.17,
    baseCheckIds: ["cors"],
    endpointCheckIds: [],
  },
];

function getCategoryChecks(cat: Category, result: CheckResponse): CheckResult[] {
  const base = result.baseChecks.filter((c) => cat.baseCheckIds.includes(c.id));
  const endpoint = result.endpoints.flatMap((ep) =>
    ep.checks.filter((c) => cat.endpointCheckIds.includes(c.id))
  );
  return [...base, ...endpoint];
}

function overallScore(result: CheckResponse): number {
  return Math.round(
    CATEGORIES.reduce((sum, cat) => {
      const checks = getCategoryChecks(cat, result);
      const { score } = scoreChecks(checks);
      return sum + score * cat.weight;
    }, 0)
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[check.status];
  const hasData = check.data !== undefined;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => hasData && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${hasData ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`text-sm font-bold shrink-0 w-4 text-center ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{check.label}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2 break-all">{check.detail}</span>
        </div>
        {hasData && <span className="text-zinc-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>}
      </button>
      {open && hasData && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
          <pre className="text-xs text-zinc-600 dark:text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap">
            {JSON.stringify(check.data, null, 2)}
          </pre>
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition"
      >
        <span className={`text-sm font-bold shrink-0 w-4 text-center ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase shrink-0">{ep.method}</span>
          <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">{ep.path}</code>
          {ep.summary && <span className="text-xs text-zinc-400 truncate hidden sm:inline">— {ep.summary}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {ep.checks.map((c) => {
            const c2 = STATUS_CONFIG[c.status];
            return (
              <span key={c.id} className={`text-xs font-bold ${c2.color}`} title={c.label}>
                {c2.icon}
              </span>
            );
          })}
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

function CategoryBar({ cat, score }: { cat: Category; score: number }) {
  const { text, ring } = gradeColor(score);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{cat.label}</div>
        <div className="text-xs text-zinc-400">{Math.round(cat.weight * 100)}% weight</div>
      </div>
      <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-400" : "bg-red-500"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className={`w-10 text-right text-sm font-semibold tabular-nums shrink-0 ${text}`}>{score}%</div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${ring} ${text}`}>
        {letterGrade(score)}
      </div>
    </div>
  );
}

function GradeCircle({ score }: { score: number }) {
  const { text, ring } = gradeColor(score);
  const grade = letterGrade(score);
  return (
    <div className={`w-24 h-24 rounded-full border-4 ${ring} flex flex-col items-center justify-center shrink-0`}>
      <span className={`text-3xl font-bold leading-none ${text}`}>{grade}</span>
      <span className="text-xs text-zinc-400 mt-0.5">{score}/100</span>
    </div>
  );
}

function CategorySection({ cat, result }: { cat: Category; result: CheckResponse }) {
  const allChecks = getCategoryChecks(cat, result);
  const { score } = scoreChecks(allChecks);
  const baseChecks = result.baseChecks.filter((c) => cat.baseCheckIds.includes(c.id));
  const endpointChecks = cat.endpointCheckIds.length > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{cat.label}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{cat.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-lg font-bold tabular-nums ${gradeColor(score).text}`}>{score}%</span>
          <span className={`text-sm font-bold px-2 py-0.5 rounded-full border ${gradeColor(score).ring} ${gradeColor(score).text}`}>
            {letterGrade(score)}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {baseChecks.map((c) => <CheckRow key={c.id} check={c} />)}
        {endpointChecks && result.endpoints.length > 0 && (
          <>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 pt-1 pb-0.5">
              {result.endpoints.length} endpoint{result.endpoints.length !== 1 ? "s" : ""} tested
              {result.totalEndpoints > result.endpoints.length && ` (of ${result.totalEndpoints} in spec)`}
            </p>
            {result.endpoints.map((ep) => <EndpointRow key={`${ep.method}:${ep.path}`} ep={ep} />)}
          </>
        )}
      </div>
    </div>
  );
}

function doctorPrompt(url: string, endpoints: EndpointResult[]): string {
  const endpointList = endpoints
    .slice(0, 3)
    .map((e) => `  - ${e.method} ${e.fullUrl}${e.summary ? ` (${e.summary})` : ""}`)
    .join("\n");
  return `You are testing x402-compliant API endpoints for Machine Payments Protocol (MPP) compliance.

Base URL: ${url}

Discovered endpoints to test:
${endpointList || `  - GET ${url}`}

For each endpoint:

1. Make a request without any payment credentials.
   - Confirm the response is HTTP 402 Payment Required.
   - Decode the X-Payment-Required base64 JSON payload.
   - Show the payment options: network, asset address, amount, payTo address.

2. Construct a valid x402 PaymentPayload for the lowest-cost option.
   - Show the full PaymentPayload JSON before encoding.
   - Base64-encode it.

3. Retry the request with the X-Payment header set to the encoded payload.
   - Confirm the response is 2xx.
   - Show the X-Payment-Response header and response body.

4. Report: network/asset used, payment amount, whether successful.

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
    await navigator.clipboard.writeText(doctorPrompt(result.url, result.endpoints));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  const score = result ? overallScore(result) : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center text-white font-bold text-xs">+</div>
            <span className="font-semibold text-sm tracking-tight">Machine Payments Doctor</span>
          </div>
          <a
            href="https://mpp.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
          >
            mpp.dev ↗
          </a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Machine Payments Doctor</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto">
            Diagnose your machine payments integration across{" "}
            <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">x402</a>
            {", "}
            <a href="https://mpp.dev" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">MPP</a>
            {", and ATXP"}
          </p>

          {/* Input */}
          <form onSubmit={runCheck} className="flex gap-2 max-w-xl mx-auto mt-5">
            <input
              type="url"
              required
              placeholder="https://api.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition shadow-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 shrink-0"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Checking…
                </span>
              ) : "Check"}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400 max-w-xl mx-auto">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div ref={resultsRef} className="space-y-5">
            {/* Score hero card */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
              <div className="flex items-start gap-6 flex-wrap">
                <GradeCircle score={score} />
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <h2 className="font-bold text-lg leading-tight">
                      {result.specTitle ?? new URL(result.url).hostname}
                    </h2>
                    <p className="text-xs font-mono text-zinc-400 mt-0.5 break-all">{result.url}</p>
                    {result.totalEndpoints > 0 && (
                      <p className="text-xs text-zinc-400 mt-1">
                        {result.totalEndpoints} payment endpoint{result.totalEndpoints !== 1 ? "s" : ""} discovered via openapi.json
                      </p>
                    )}
                  </div>
                  <div className="space-y-3">
                    {CATEGORIES.map((cat) => {
                      const checks = getCategoryChecks(cat, result);
                      const { score: catScore } = scoreChecks(checks);
                      return <CategoryBar key={cat.id} cat={cat} score={catScore} />;
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Category sections */}
            {CATEGORIES.map((cat) => (
              <CategorySection key={cat.id} cat={cat} result={result} />
            ))}

            {/* Footer */}
            <div className="flex items-center justify-between flex-wrap gap-3 px-1 text-xs text-zinc-400">
              <span>
                Tested {new Date(result.testedAt).toLocaleString()} ·{" "}
                <a href="https://mpp.dev/advanced/discovery" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">
                  MPP discovery spec ↗
                </a>
              </span>
              <button
                onClick={copyPrompt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition"
              >
                {promptCopied ? "✓ Copied!" : "✦ Copy doctor prompt"}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800">
              {[
                {
                  id: "discovery",
                  label: "Discovery",
                  weight: "33%",
                  color: "bg-violet-500",
                  items: ["openapi.json with x-payment-info", "llms.txt for AI context", ".well-known/agent-card.json", "CORS headers"],
                },
                {
                  id: "protocol",
                  label: "Protocol",
                  weight: "50%",
                  color: "bg-violet-600",
                  items: ["HTTP 402 without payment (per endpoint)", "X-Payment-Required header & payload", "Mainnet USDC accepted / testnet warnings"],
                },
                {
                  id: "accessibility",
                  label: "Accessibility",
                  weight: "17%",
                  color: "bg-violet-400",
                  items: ["Cross-origin access for browser agents"],
                },
              ].map((cat) => (
                <div key={cat.id} className="px-5 py-4 flex items-start gap-4">
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${cat.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-sm">{cat.label}</span>
                      <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{cat.weight}</span>
                    </div>
                    <ul className="space-y-1">
                      {cat.items.map((item) => (
                        <li key={item} className="text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-1.5">
                          <span className="text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5">›</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
