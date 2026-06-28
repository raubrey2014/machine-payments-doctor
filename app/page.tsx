"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { gradeColors, letterGrade } from "./lib/scoring";

function subscribeToLocation() {
  return () => {};
}

function getBrowserDoctorApiUrl() {
  return `${window.location.origin}/api/check`;
}

function getServerDoctorApiUrl() {
  return "/api/check";
}

// ── Score mockup (static illustration) ───────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [agentPromptCopied, setAgentPromptCopied] = useState(false);
  const doctorApiUrl = useSyncExternalStore(
    subscribeToLocation,
    getBrowserDoctorApiUrl,
    getServerDoctorApiUrl
  );
  const router = useRouter();
  const agentPrompt = `Check our MPP integration health with Machine Payments Doctor: curl -X POST ${doctorApiUrl} -H 'Content-Type: application/json' -d '{"url":"<our site URL>"}'`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = url.trim();
    if (!raw) return;
    try {
      const u = new URL(raw);
      const slug = u.hostname;
      const hasPath = u.pathname !== "/" || u.search;
      const query = hasPath ? `?url=${encodeURIComponent(raw)}` : "";
      router.push(`/eval/${slug}${query}`);
    } catch {
      setError("Please enter a valid URL including https://");
    }
  }

  async function copyAgentPrompt() {
    await navigator.clipboard.writeText(agentPrompt);
    setAgentPromptCopied(true);
    setTimeout(() => setAgentPromptCopied(false), 2000);
  }

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

        <form onSubmit={handleSubmit} className="mt-8 flex gap-3 max-w-2xl mx-auto">
          <input
            type="url"
            required
            placeholder="https://api.example.com"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            className="flex-1 px-5 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition shadow-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
          />
          <button
            type="submit"
            className="px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 shrink-0"
          >
            Check →
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-zinc-400">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            or
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-4 text-left">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-950/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
                  Agent mode
                </span>
                <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Tell your agent to fix the integration for you.
                </p>
                <button
                  type="button"
                  onClick={copyAgentPrompt}
                  className="shrink-0 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition"
                >
                  {agentPromptCopied ? "✓ Copied!" : "Copy prompt"}
                </button>
              </div>
              <pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre overflow-x-auto leading-relaxed">
                {agentPrompt}
              </pre>
            </div>
          </div>
        </div>
      </section>

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
                label: "Discovery", weight: "33%",
                color: "border-violet-300 dark:border-violet-700",
                accent: "text-violet-600 dark:text-violet-400",
                dot: "bg-violet-500",
                desc: "Can AI agents find, read, and authenticate your service before paying?",
                checks: ["openapi.json with x-payment-info", "llms.txt for AI context", ".well-known/agent-card.json"],
              },
              {
                label: "Protocol", weight: "50%",
                color: "border-violet-400 dark:border-violet-600",
                accent: "text-violet-700 dark:text-violet-300",
                dot: "bg-violet-600",
                desc: "Does the payment challenge work correctly across your endpoints?",
                checks: ["HTTP 402 without credentials", "MPP (WWW-Authenticate: Payment)", "x402 (PAYMENT-REQUIRED header)", "Mainnet USDC accepted"],
              },
              {
                label: "Accessibility", weight: "17%",
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
    </div>
  );
}
