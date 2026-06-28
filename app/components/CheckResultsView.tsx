"use client";

import { useState } from "react";
import type { CategoryId, CheckResponse, CheckResult, CheckStatus, EndpointResult } from "../lib/doctor-types";
import { gradeColors } from "../lib/scoring";

// ── Primitives ────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<CheckStatus, { icon: string; color: string; bg: string; border: string }> = {
  pass: { icon: "✓", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800" },
  fail: { icon: "✗", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800" },
  warn: { icon: "⚠", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800" },
  skip: { icon: "–", color: "text-zinc-400 dark:text-zinc-500", bg: "bg-zinc-50 dark:bg-zinc-900/40", border: "border-zinc-200 dark:border-zinc-700" },
};

export function worstStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.some((c) => c.status === "pass")) return "pass";
  return "skip";
}

// ── Check row ─────────────────────────────────────────────────────────────────

export function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[check.status];
  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => check.data !== undefined && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${check.data !== undefined ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`text-sm font-bold shrink-0 w-4 text-center ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{check.label}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2 break-all">{check.detail}</span>
        </div>
        {check.data !== undefined && (
          <span className="text-zinc-400 text-xs shrink-0">{open ? "▴" : "▾"}</span>
        )}
      </button>
      {open && check.data !== undefined && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
          <pre className="text-xs text-zinc-600 dark:text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap">
            {JSON.stringify(check.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Endpoint row ──────────────────────────────────────────────────────────────

export function EndpointRow({ ep }: { ep: EndpointResult }) {
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
          {ep.summary && (
            <span className="text-xs text-zinc-400 truncate hidden sm:inline">— {ep.summary}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ep.checks.map((c) => (
            <span key={c.id} className={`text-xs font-bold ${STATUS_CONFIG[c.status].color}`}>
              {STATUS_CONFIG[c.status].icon}
            </span>
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

// ── Category section ──────────────────────────────────────────────────────────

const CATEGORY_CHECK_IDS: Record<CategoryId, { baseIds: string[]; epIds: string[] }> = {
  discovery: { baseIds: ["openapi_json", "llms_txt", "agent_card"], epIds: [] },
  protocol: { baseIds: [], epIds: ["402", "mpp_challenge", "x402_challenge", "payment_assets"] },
  accessibility: { baseIds: ["cors"], epIds: [] },
};

function CategorySection({ category, result }: { category: CheckResponse["categories"][number]; result: CheckResponse }) {
  const checkIds = CATEGORY_CHECK_IDS[category.id];
  const baseChecks = result.baseChecks.filter((c) => checkIds.baseIds.includes(c.id));
  const hasEndpoints = checkIds.epIds.length > 0;
  const { text, ring } = gradeColors(category.score);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">{category.label}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{category.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xl font-bold tabular-nums ${text}`}>{category.score}%</span>
          <span className={`font-bold text-sm px-2 py-0.5 rounded-full border ${ring} ${text}`}>
            {category.grade}
          </span>
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
            {result.endpoints.map((ep) => (
              <EndpointRow key={`${ep.method}:${ep.path}`} ep={ep} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Score display ─────────────────────────────────────────────────────────────

export function GradeCircle({ score, grade }: { score: number; grade: string }) {
  const { text, ring } = gradeColors(score);
  return (
    <div className={`w-24 h-24 rounded-full border-4 ${ring} flex flex-col items-center justify-center shrink-0`}>
      <span className={`text-3xl font-bold leading-none ${text}`}>{grade}</span>
      <span className="text-xs text-zinc-400 mt-0.5">{score}/100</span>
    </div>
  );
}

export function CategoryBar({
  label, weight, score, grade,
}: { label: string; weight: number; score: number; grade: string }) {
  const { text, ring, bar } = gradeColors(score);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{label}</div>
        <div className="text-xs text-zinc-400">{Math.round(weight * 100)}% weight</div>
      </div>
      <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className={`w-10 text-right text-sm font-semibold tabular-nums shrink-0 ${text}`}>{score}%</div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${ring} ${text}`}>
        {grade}
      </div>
    </div>
  );
}

// ── Full results view ─────────────────────────────────────────────────────────

export function CheckResultsView({ result }: { result: CheckResponse }) {
  const [promptCopied, setPromptCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(result.doctorPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  const hostname = (() => {
    try { return new URL(result.url).hostname; } catch { return result.url; }
  })();

  return (
    <div className="space-y-5">
      {/* Score card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <div className="flex items-start gap-6 flex-wrap">
          <GradeCircle score={result.score} grade={result.grade} />
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h2 className="font-bold text-lg">{result.specTitle ?? hostname}</h2>
              <p className="text-xs font-mono text-zinc-400 mt-0.5 break-all">{result.url}</p>
              {result.totalEndpoints > 0 && (
                <p className="text-xs text-zinc-400 mt-1">
                  {result.totalEndpoints} payment endpoint{result.totalEndpoints !== 1 ? "s" : ""} discovered via openapi.json
                </p>
              )}
            </div>
            <div className="space-y-3">
              {result.categories.map((category) => (
                <CategoryBar
                  key={category.id}
                  label={category.label}
                  weight={category.weight}
                  score={category.score}
                  grade={category.grade}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Category sections */}
      {result.categories.map((category) => (
        <CategorySection key={category.id} category={category} result={result} />
      ))}

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
          {result.doctorPrompt}
        </pre>
      </div>

      {/* Footer */}
      <div className="px-1 text-xs text-zinc-400">
        Tested {new Date(result.testedAt).toLocaleString()} ·{" "}
        <a
          href="https://mpp.dev/advanced/discovery"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-500 hover:underline"
        >
          MPP discovery spec ↗
        </a>
      </div>
    </div>
  );
}
