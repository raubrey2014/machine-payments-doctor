"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckResultsView } from "../../components/CheckResultsView";
import type { CheckResponse } from "../../lib/doctor-types";

const ASCII_ART = `@@##@+                          :#@#@@+     :@@#####################@@@@@@@#########@@@@@@@@@@@@@@@@@@@@@@@@@##@%-
@@@@@@&.                       =@@@@@@+     :@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%-
@@@@@@@@@-                  .&@@@@@@@@+     :@@@@@@@$$$$$$$$$$$$$$$$$8@@@@@@@@@#****8@@@@@@8$$$$$$$$$$$$$$$$&@@@@@@@@@8-
@@@@@@@@@@+                .8@@@@@@@@@+     :@@@@@@@                  -%@@@@@@@@*   $@@@@@@$                 .*@@@@@@@@@
@@@@@@@@@@@&.             -#@@@@@@@@@@+     :@@@@@@@                    -#@@@@@@*   $@@@@@@$                   .*@@@@@@@
@@@@@@@@@@@@8:           =@@@@@@@@@@@@+     :@@@@@@@                     %@@@@@@*   $@@@@@@$                    :@@@@@@@
@@@@@@@@@@@@@@-        .*@@@@@@@@@@@@@+     :@@@@@@@                     %@@@@@@*   $@@@@@@$                    :@@@@@@@
@@@@@@@@@@@@@@@+      .%@@@@@@@@@@@@@@+     :@@@@@@@                     %@@@@@@*   $@@@@@@$                    :@@@@@@@
@@@@@@@:.&@@@@@@@8: -@@@@@@@#: 8@@@@@@+     :@@@@@@@                   -8@@@@@@@*   $@@@@@@$                  .*@@@@@@@@
@@@@@@@:  *@@@@@@@@*@@@@@@@%.  8@@@@@@+     :@@@@@@@.................-8@@@@@@@@@-   $@@@@@@$.................*@@@@@@@@@%
@@@@@@@:   =@@@@@@@@@@@@@@$.   8@@@@@@+     :@@@@@@@#################@@@@@@@@@*.    $@@@@@@##################@@@@@@@@%-
@@@@@@@:    :#@@@@@@@@@@@+     8@@@@@@+     :@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@#+.      $@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%-
@@@@@@@:      .*@@@@@@8.       8@@@@@@+     :@@@@@@@$$$$$$$$$$$$$$$$$$$$+.          $@@@@@@8$$$$$$$$$$$$$$$$$$$*:
@@@@@@@:        =@@@@&.        8@@@@@@+     :@@@@@@@                                $@@@@@@$
@@@@@@@:                       8@@@@@@+     :@@@@@@@                                $@@@@@@$
@@@@@@@:                       8@@@@@@+     :@@@@@@@                                $@@@@@@$
@@@@@@@:                       8@@@@@@+     :@@@@@@@                                $@@@@@@$
@@@@@@@:                       8@@@@@@#888888@@@@@@@                                $@@@@@@$
@@@@@@@:                       8@@@@@@@@@@@@@@@@@@@@                                $@@@@@@$
@@###@@:                       8@@@@@@@#####@@@@@#@@                                $@####@$                            `;

function AnimatedAscii() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    const rows = ASCII_ART.split('\n');
    const nonSpacePos: [number, number][] = [];

    const rowEls: HTMLElement[][] = rows.map((row, r) => {
      const rowDiv = document.createElement('div');
      const cells = Array.from(row).map((ch, c) => {
        const span = document.createElement('span');
        span.textContent = ch;
        if (ch !== ' ') nonSpacePos.push([r, c]);
        rowDiv.appendChild(span);
        return span;
      });
      container.appendChild(rowDiv);
      return cells;
    });

    const BRIGHT = '#a1a1aa';
    const DIM = '#52525b';

    nonSpacePos.forEach(([r, c]) => {
      const el = rowEls[r]?.[c];
      if (el) (el as HTMLElement).style.color = DIM;
    });

    let active: Array<[number, number]> = [];
    let timerId: ReturnType<typeof setTimeout>;

    function tick() {
      active.forEach(([r, c]) => {
        const el = rowEls[r]?.[c];
        if (el) (el as HTMLElement).style.color = DIM;
      });
      active = [];
      for (let i = 0; i < 20; i++) {
        const pos = nonSpacePos[Math.floor(Math.random() * nonSpacePos.length)];
        if (pos) {
          active.push(pos);
          const el = rowEls[pos[0]]?.[pos[1]];
          if (el) (el as HTMLElement).style.color = BRIGHT;
        }
      }
      timerId = setTimeout(tick, 100);
    }

    tick();
    return () => clearTimeout(timerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="select-none text-[7px]"
      style={{
        fontFamily: 'monospace',
        lineHeight: 2,
        whiteSpace: 'pre',
        letterSpacing: '1px',
        overflow: 'visible',
        margin: '0 auto',
      }}
    />
  );
}

export default function EvalPage() {
  const params = useParams<{ site: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const site = decodeURIComponent(params.site ?? "");
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
      setError("Invalid URL");
    }
  }

  return (
    <div className="min-h-screen bg-[#141414] text-zinc-100 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 shrink-0">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image src="/logo-light.svg" alt="MPP" width={52} height={23} className="opacity-90" />
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-medium text-zinc-400">Validator</span>
          </Link>
          <form onSubmit={handleCheck} className="flex gap-2 flex-1 max-w-sm">
            <input
              type="url"
              placeholder="Check another URL…"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-500 transition text-zinc-300 placeholder:text-zinc-600"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-semibold transition shrink-0"
            >
              Check
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 w-full flex-1">
        {loading && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
            <AnimatedAscii />
            <p className="text-sm text-zinc-500">
              Checking <span className="font-mono text-zinc-300">{targetUrl}</span>…
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {result && <CheckResultsView result={result} />}
      </div>
    </div>
  );
}
