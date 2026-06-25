"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckResultsView } from "../../components/CheckResultsView";
import type { CheckResponse } from "../../api/check/route";

export default function EvalPage() {
  const params = useParams<{ site: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const site = decodeURIComponent(params.site ?? "");
  // Allow ?url= override for non-root URLs; default to https://<site>
  const targetUrl = searchParams.get("url") ?? `https://${site}`;

  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Request failed" }));
          if (!cancelled) setError(body.error ?? "Request failed");
          return;
        }
        const data: CheckResponse = await res.json();
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [targetUrl]);

  function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    const raw = inputUrl.trim();
    if (!raw) return;
    try {
      const u = new URL(raw);
      const slug = u.hostname;
      const hasPath = u.pathname !== "/" || u.search;
      const query = hasPath ? `?url=${encodeURIComponent(raw)}` : "";
      router.push(`/eval/${slug}${query}`);
    } catch {
      // not a valid URL, show inline error
      setError("Invalid URL");
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center text-white font-bold text-[11px]">+</div>
            <span className="font-semibold text-sm">Machine Payments Doctor</span>
          </a>
          {/* Inline check-another form */}
          <form onSubmit={handleCheck} className="flex gap-2 flex-1 max-w-sm">
            <input
              type="url"
              placeholder="Check another URL…"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition shrink-0"
            >
              Check
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {loading && (
          <div className="space-y-5">
            {/* Skeleton score card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 rounded-full border-4 border-zinc-200 dark:border-zinc-700 animate-pulse" />
                <div className="flex-1 space-y-3 pt-2">
                  <div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-48 animate-pulse" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-72 animate-pulse" />
                  <div className="space-y-2 pt-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-28 h-3 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                        <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
                        <div className="w-8 h-3 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center text-sm text-zinc-400 py-4">
              Checking <span className="font-mono text-zinc-600 dark:text-zinc-300">{targetUrl}</span>…
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {result && <CheckResultsView result={result} />}
      </div>
    </div>
  );
}
