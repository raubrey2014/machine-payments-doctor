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
        <span className={`mt-0.5 text-base font-bold shrink-0 w-4 text-center ${cfg.color}`}>
          {cfg.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{check.label}</span>
            <span className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.color} ${cfg.bg}`}>
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

  const color =
    score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <div className={`text-4xl font-bold tabular-nums ${color}`}>{score}%</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">compliance</div>
      </div>
      <div className="flex gap-4 text-sm">
        {[
          { val: passed, label: "passed", color: "text-emerald-600 dark:text-emerald-400" },
          { val: warned, label: "warnings", color: "text-amber-600 dark:text-amber-400" },
          { val: failed, label: "failed", color: "text-red-600 dark:text-red-400" },
        ].map(({ val, label, color }) => (
          <div key={label} className="text-center">
            <div className={`font-semibold ${color}`}>{val}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function doctorPrompt(url: string): string {
  return `You are testing an x402-compliant API endpoint for Machine Payments Protocol (MPP) compliance.

Endpoint: ${url}

Using the @x402/fetch package (or raw fetch with the x402 protocol), do the following:

1. Make a GET request to ${url} without any payment credentials.
   - Confirm the response is HTTP 402 Payment Required.
   - Read the X-Payment-Required header and decode the base64 JSON payload to see what payment options are available (network, asset, amount, payTo address).

2. Construct a valid x402 PaymentPayload for one of the offered payment methods.
   - Select the lowest-cost option.
   - Show the full PaymentPayload JSON before encoding.

3. Base64-encode the PaymentPayload and retry the request with the X-Payment header set.
   - Confirm the response is 2xx.
   - Show the X-Payment-Response header from the successful response.

4. Report:
   - Which network/asset was used
   - The payment amount
   - Whether the payTo address received the funds
   - The full response body

Use the MPP discovery spec at https://mpp.dev/advanced/discovery as reference.`.trim();
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
    await navigator.clipboard.writeText(doctorPrompt(result.url));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
              +
            </div>
            <h1 className="text-xl font-bold tracking-tight">Machine Payments Doctor</h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Diagnose your{" "}
            <a
              href="https://mpp.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 dark:text-violet-400 hover:underline"
            >
              MPP
            </a>
            -compliant endpoint
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
              placeholder="https://api.example.com/v1/endpoint"
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
              ) : (
                "Check"
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
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div>
                  <h2 className="font-semibold text-sm">Diagnosis</h2>
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

              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  Tested {new Date(result.testedAt).toLocaleString()} ·{" "}
                  <a
                    href="https://mpp.dev/advanced/discovery"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-500 hover:underline"
                  >
                    MPP discovery spec ↗
                  </a>
                </p>

                {/* Doctor prompt button */}
                <button
                  onClick={copyPrompt}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition"
                >
                  {promptCopied ? (
                    <>
                      <span>✓</span> Copied!
                    </>
                  ) : (
                    <>
                      <span>✦</span> Copy doctor prompt
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Doctor prompt preview */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Doctor prompt</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Give this to Claude to actually test your endpoint with x402 payments
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
                {doctorPrompt(result.url)}
              </pre>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
            <h3 className="font-semibold text-sm mb-3">What gets checked</h3>
            <ul className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              {[
                ["Returns HTTP 402 without payment", "Core MPP requirement — unauthenticated requests must return 402"],
                ["x402 payment details on 402", "X-Payment-Required header with base64 PaymentPayload JSON"],
                ["Payment assets (mainnet USDC)", "Checks whether mainnet USDC is accepted; warns if testnet PathUSD tokens are also offered"],
                ["openapi.json", "MPP discovery document with x-payment-info extension"],
                ["llms.txt", "AI context file so agents understand your service"],
                [".well-known/agent-card.json", "Agent identity card for machine-to-machine discovery"],
                ["CORS headers", "Cross-origin access for browser-based agents"],
              ].map(([label, desc]) => (
                <li key={label} className="flex items-start gap-3">
                  <span className="text-violet-500 shrink-0 mt-0.5">›</span>
                  <span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                    <span className="text-zinc-500 dark:text-zinc-500"> — {desc}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-600">
              Learn more:{" "}
              <a
                href="https://mpp.dev/advanced/discovery"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 hover:underline"
              >
                MPP discovery spec ↗
              </a>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
