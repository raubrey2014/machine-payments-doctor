"use client";

import { useState, useRef } from "react";
import type { CheckResponse, CheckResult, CheckStatus } from "./api/check/route";

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
        className={`w-full flex items-start gap-3 px-4 py-3 text-left ${hasData ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`mt-0.5 text-base font-bold shrink-0 ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{check.label}</span>
            <span
              className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.color} ${cfg.bg}`}
            >
              {check.status}
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 break-all">{check.detail}</p>
        </div>
        {hasData && (
          <span className="text-zinc-400 text-xs shrink-0 mt-0.5">{open ? "▲" : "▼"}</span>
        )}
      </button>
      {open && hasData && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <pre className="text-xs text-zinc-700 dark:text-zinc-300 overflow-auto max-h-64 whitespace-pre-wrap">
            {JSON.stringify(check.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ checks }: { checks: CheckResult[] }) {
  const applicable = checks.filter((c) => c.status !== "skip");
  const passed = applicable.filter((c) => c.status === "pass").length;
  const failed = applicable.filter((c) => c.status === "fail").length;
  const warned = applicable.filter((c) => c.status === "warn").length;
  const score = applicable.length > 0 ? Math.round((passed / applicable.length) * 100) : 0;

  let color = "text-emerald-600 dark:text-emerald-400";
  if (score < 50) color = "text-red-600 dark:text-red-400";
  else if (score < 80) color = "text-amber-600 dark:text-amber-400";

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="text-center">
        <div className={`text-4xl font-bold ${color}`}>{score}%</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">compliance score</div>
      </div>
      <div className="flex gap-4 text-sm">
        <div className="text-center">
          <div className="font-semibold text-emerald-600 dark:text-emerald-400">{passed}</div>
          <div className="text-xs text-zinc-500">passed</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-amber-600 dark:text-amber-400">{warned}</div>
          <div className="text-xs text-zinc-500">warnings</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-red-600 dark:text-red-400">{failed}</div>
          <div className="text-xs text-zinc-500">failed</div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [paymentToken, setPaymentToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        body: JSON.stringify({ url: url.trim(), paymentToken: paymentToken.trim() }),
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

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
              M
            </div>
            <h1 className="text-xl font-bold tracking-tight">Machine Payments Doctor</h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Diagnose and validate that your endpoint is compliant with the{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Machine Payments Protocol</span>
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Form */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
          <form onSubmit={runCheck} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="url">
                Endpoint URL
              </label>
              <input
                id="url"
                type="url"
                required
                placeholder="https://api.example.com/v1/resource"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                The URL of the 402-protected resource to validate
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="token">
                L402 Payment Token{" "}
                <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <input
                id="token"
                type="text"
                placeholder="macaroon:preimage"
                value={paymentToken}
                onChange={(e) => setPaymentToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Provide a valid L402 token to test authenticated access returns 200
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Running checks…
                </span>
              ) : (
                "Run MPP Checks"
              )}
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
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <h2 className="font-semibold text-sm">Results</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono break-all">
                    {result.url}
                  </p>
                </div>
                <ScoreBadge checks={result.checks} />
              </div>

              <div className="space-y-2">
                {result.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </div>

              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-4">
                Tested at {new Date(result.testedAt).toLocaleString()}
              </p>
            </div>

            {/* Check legend */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
              <h3 className="font-semibold text-sm mb-3">What does each check verify?</h3>
              <dl className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                {[
                  ["Returns 402 without payment", "Unauthenticated requests must return HTTP 402 Payment Required, not 200 or 401."],
                  ["Payment header on 402", "The 402 response should include WWW-Authenticate: L402 or X-Payment-Details so clients know how to pay."],
                  ["Returns 200 with payment token", "After paying, requests with a valid L402 Authorization header should succeed."],
                  ["openapi.json", "A machine-readable API spec at {base}/openapi.json lets agents discover available endpoints."],
                  [".well-known/agent-card", "An agent card at {base}/.well-known/agent-card describes the service identity and capabilities for AI agents."],
                  ["CORS headers", "Cross-origin requests must be permitted so browser-based agents can call the API."],
                  ["JSON Content-Type on 402", "Machine clients expect application/json on error responses to parse payment details."],
                ].map(([term, def]) => (
                  <div key={term} className="flex gap-2">
                    <dt className="font-medium text-zinc-700 dark:text-zinc-300 shrink-0">{term}:</dt>
                    <dd>{def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
            <h3 className="font-semibold text-sm mb-3">Checks performed</h3>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {[
                "Returns HTTP 402 without a payment credential",
                "Includes payment instructions in the 402 response headers",
                "Returns 2xx when a valid L402 token is provided",
                "Exposes openapi.json at the root",
                "Exposes .well-known/agent-card at the root",
                "Returns CORS headers permitting cross-origin access",
                "Uses application/json Content-Type on 402 responses",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-violet-500 shrink-0 mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
