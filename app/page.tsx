"use client";

import { useState, useRef } from "react";
import type { CheckResponse, CheckResult, CheckStatus, EndpointResult } from "./api/check/route";

const STATUS_CONFIG: Record<CheckStatus, { icon: string; color: string; bg: string; border: string }> = {
  pass: {
    icon: "✓",
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  fail: {
    icon: "✗",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800",
  },
  warn: {
    icon: "⚠",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
  },
  skip: {
    icon: "–",
    color: "text-zinc-500 dark:text-zinc-400",
    bg: "bg-zinc-50 dark:bg-zinc-900/40",
    border: "border-zinc-200 dark:border-zinc-700",
  },
};

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[check.status];
  const hasData = check.data !== undefined;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => hasData && setOpen((v) => !v)}
        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left ${hasData ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`mt-0.5 text-sm font-bold shrink-0 w-4 text-center ${cfg.color}`}>
          {cfg.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-xs text-zinc-900 dark:text-zinc-100">{check.label}</span>
            <span className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.color} ${cfg.bg}`}>
              {check.status}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 break-all">{check.detail}</p>
        </div>
        {hasData && (
          <span className="text-zinc-400 text-xs shrink-0 mt-0.5">{open ? "▲" : "▼"}</span>
        )}
      </button>
      {open && hasData && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
          <pre className="text-xs text-zinc-700 dark:text-zinc-300 overflow-auto max-h-48 whitespace-pre-wrap">
            {JSON.stringify(check.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function statusDot(status: CheckStatus) {
  const colors: Record<CheckStatus, string> = {
    pass: "bg-emerald-500",
    fail: "bg-red-500",
    warn: "bg-amber-400",
    skip: "bg-zinc-300 dark:bg-zinc-600",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status]}`} />;
}

function worstStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.some((c) => c.status === "pass")) return "pass";
  return "skip";
}

function EndpointCard({ ep }: { ep: EndpointResult }) {
  const [open, setOpen] = useState(false);
  const worst = worstStatus(ep.checks);
  const cfg = STATUS_CONFIG[worst];

  return (
    <div className={`rounded-lg border ${cfg.border} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition"
      >
        {statusDot(worst)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">
              {ep.method}
            </span>
            <code className="text-xs font-mono text-zinc-800 dark:text-zinc-200 break-all">{ep.path}</code>
          </div>
          {ep.summary && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{ep.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ep.checks.map((c) => (
            <span key={c.id}>{statusDot(c.status)}</span>
          ))}
          <span className="text-zinc-400 text-xs ml-1">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 py-3 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/30">
          <p className="text-xs text-zinc-400 font-mono mb-2 break-all">{ep.fullUrl}</p>
          {ep.checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScorePill({ checks }: { checks: CheckResult[] }) {
  const applicable = checks.filter((c) => c.status !== "skip");
  const passed = applicable.filter((c) => c.status === "pass").length;
  const score = applicable.length > 0 ? Math.round((passed / applicable.length) * 100) : 0;
  const color =
    score >= 80 ? "text-emerald-600 dark:text-emerald-400" :
    score >= 50 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";
  return <span className={`font-bold tabular-nums ${color}`}>{score}%</span>;
}

function OverallScore({ result }: { result: CheckResponse }) {
  const allChecks = [
    ...result.baseChecks,
    ...result.endpoints.flatMap((e) => e.checks),
  ];
  const applicable = allChecks.filter((c) => c.status !== "skip");
  const passed = applicable.filter((c) => c.status === "pass").length;
  const failed = applicable.filter((c) => c.status === "fail").length;
  const warned = applicable.filter((c) => c.status === "warn").length;
  const score = applicable.length > 0 ? Math.round((passed / applicable.length) * 100) : 0;
  const color =
    score >= 80 ? "text-emerald-600 dark:text-emerald-400" :
    score >= 50 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";

  return (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <div className={`text-4xl font-bold tabular-nums ${color}`}>{score}%</div>
        <div className="text-xs text-zinc-500 mt-0.5">compliance</div>
      </div>
      <div className="flex gap-4">
        {[
          { val: passed, label: "passed", color: "text-emerald-600 dark:text-emerald-400" },
          { val: warned, label: "warnings", color: "text-amber-600 dark:text-amber-400" },
          { val: failed, label: "failed", color: "text-red-600 dark:text-red-400" },
        ].map(({ val, label, color }) => (
          <div key={label} className="text-center">
            <div className={`font-semibold text-sm ${color}`}>{val}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
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

1. Make a ${endpoints[0]?.method ?? "GET"} request without any payment credentials.
   - Confirm the response is HTTP 402 Payment Required.
   - Read the X-Payment-Required header and decode the base64 JSON payload.
   - Show the payment options: network, asset address, amount, payTo address.

2. Construct a valid x402 PaymentPayload for the lowest-cost option.
   - Show the full PaymentPayload JSON before encoding.
   - Base64-encode it.

3. Retry the request with the X-Payment header set to the encoded payload.
   - Confirm the response is 2xx.
   - Show the X-Payment-Response header and response body.

4. Report for each endpoint:
   - Which network/asset was used and the payment amount
   - Whether the response was successful
   - Any unexpected behavior

Reference: https://mpp.dev/advanced/discovery`.trim();
}

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
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
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

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm">+</div>
            <h1 className="text-xl font-bold tracking-tight">Machine Payments Doctor</h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Diagnose your{" "}
            <a href="https://mpp.dev" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">MPP</a>
            -compliant service
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Form */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
          <form onSubmit={runCheck} className="flex gap-2">
            <input
              type="url"
              required
              placeholder="https://api.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 shrink-0"
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
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div ref={resultsRef} className="space-y-4">
            {/* Overall score */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-semibold text-sm">
                    {result.specTitle ?? new URL(result.url).hostname}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono break-all">{result.url}</p>
                  {result.totalEndpoints > 0 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      {result.totalEndpoints} payment endpoint{result.totalEndpoints !== 1 ? "s" : ""} in spec
                      {result.endpoints.length < result.totalEndpoints && ` · testing ${result.endpoints.length}`}
                    </p>
                  )}
                </div>
                <OverallScore result={result} />
              </div>
            </div>

            {/* Discovery checks */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="font-semibold text-sm">Discovery</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Service-level checks</p>
              </div>
              <div className="p-4 space-y-2">
                {result.baseChecks.map((c) => <CheckRow key={c.id} check={c} />)}
              </div>
            </div>

            {/* Endpoint results */}
            {result.endpoints.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">
                      Endpoints
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        ({result.endpoints.length} tested
                        {result.totalEndpoints > result.endpoints.length && ` of ${result.totalEndpoints}`})
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Click an endpoint to see its checks
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    {[
                      { status: "pass" as CheckStatus, label: "pass" },
                      { status: "warn" as CheckStatus, label: "warn" },
                      { status: "fail" as CheckStatus, label: "fail" },
                    ].map(({ status, label }) => {
                      const count = result.endpoints.filter((e) => worstStatus(e.checks) === status).length;
                      return count > 0 ? (
                        <span key={label} className="flex items-center gap-1">
                          {statusDot(status)} {count}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {result.endpoints.map((ep) => (
                    <EndpointCard key={`${ep.method}:${ep.path}`} ep={ep} />
                  ))}
                </div>
                {result.totalEndpoints > result.endpoints.length && (
                  <div className="px-4 pb-4">
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center">
                      {result.totalEndpoints - result.endpoints.length} more endpoints in spec — showing first {result.endpoints.length}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between flex-wrap gap-3 px-1">
              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                Tested {new Date(result.testedAt).toLocaleString()} ·{" "}
                <a href="https://mpp.dev/advanced/discovery" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">
                  MPP discovery spec ↗
                </a>
              </p>
              <button
                onClick={copyPrompt}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition"
              >
                {promptCopied ? <>✓ Copied!</> : <>✦ Copy doctor prompt</>}
              </button>
            </div>

            {/* Doctor prompt */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Doctor prompt</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Give this to Claude to run live x402 payment tests
                  </p>
                </div>
                <button
                  onClick={copyPrompt}
                  className="text-xs px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-600 dark:text-zinc-300"
                >
                  {promptCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="text-xs text-zinc-600 dark:text-zinc-400 p-4 overflow-auto max-h-72 whitespace-pre-wrap leading-relaxed">
                {doctorPrompt(result.url, result.endpoints)}
              </pre>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
            <h3 className="font-semibold text-sm mb-3">What gets checked</h3>
            <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
              <div>
                <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Discovery</p>
                <ul className="space-y-1.5 pl-3">
                  {[
                    ["openapi.json", "MPP discovery document — used to find API endpoints"],
                    ["llms.txt", "AI context file so agents understand your service"],
                    [".well-known/agent-card.json", "Agent identity card for M2M discovery"],
                    ["CORS headers", "Cross-origin access for browser-based agents"],
                  ].map(([label, desc]) => (
                    <li key={label} className="flex items-start gap-2">
                      <span className="text-violet-400 shrink-0">›</span>
                      <span><span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span> — {desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Per endpoint (parsed from openapi.json)</p>
                <ul className="space-y-1.5 pl-3">
                  {[
                    ["402 without payment", "Unauthenticated request must return 402"],
                    ["x402 payment details", "X-Payment-Required header with PaymentPayload JSON"],
                    ["Mainnet USDC", "USDC accepted; warns if testnet PathUSD tokens are also offered"],
                  ].map(([label, desc]) => (
                    <li key={label} className="flex items-start gap-2">
                      <span className="text-violet-400 shrink-0">›</span>
                      <span><span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span> — {desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-600">
              <a href="https://mpp.dev/advanced/discovery" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">MPP discovery spec ↗</a>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
