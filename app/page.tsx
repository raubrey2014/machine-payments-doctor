"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";


function TempoLogo() {
  return (
    <svg style={{ height: 13, width: "auto" }} viewBox="0 0 832 185" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tempo" role="img">
      <path d="M61.5297 181.489H12.6398L57.9524 43.1662H0L12.6398 2.62335H174.096L161.456 43.1662H106.604L61.5297 181.489Z" fill="currentColor"/>
      <path d="M243.464 181.489H127.559L185.75 2.62335H301.178L290.207 36.727H223.192L211.029 75.1235H275.898L264.928 108.75H199.821L187.658 147.385H254.196L243.464 181.489Z" fill="currentColor"/>
      <path d="M295.923 181.489H257.05L315.479 2.62335H380.348L378.202 99.2107L441.401 2.62335H512.47L454.279 181.489H405.628L444.262 61.2912H443.547L364.131 181.489H335.274L336.466 59.8603H335.989L295.923 181.489Z" fill="currentColor"/>
      <path d="M567.193 35.7731L548.353 93.487H553.6C565.524 93.487 575.461 90.7046 583.411 85.1399C591.36 79.4162 596.527 71.3077 598.912 60.8142C600.979 51.7517 599.866 45.3126 595.573 41.4968C591.281 37.681 584.126 35.7731 574.109 35.7731H567.193ZM519.973 181.489H471.083L529.274 2.62335H588.657C602.331 2.62335 614.096 4.84923 623.953 9.30099C633.97 13.5938 641.283 19.7944 645.894 27.903C650.664 35.8526 652.254 45.1536 650.664 55.806C648.597 69.7973 643.191 82.1191 634.447 92.7715C625.702 103.424 614.334 111.692 600.343 117.574C586.511 123.298 571.009 126.16 553.838 126.16H537.859L519.973 181.489Z" fill="currentColor"/>
      <path d="M767.195 170.041C750.977 179.581 733.727 184.351 715.443 184.351H714.966C698.749 184.351 685.076 180.773 673.946 173.619C662.976 166.305 655.106 156.448 650.336 144.046C645.725 131.645 644.612 118.051 646.997 103.265C650.018 84.6629 656.934 67.4919 667.745 51.7517C678.557 36.0116 692.071 23.4512 708.288 14.0707C724.505 4.69025 741.836 0 760.279 0H760.755C777.609 0 791.52 3.57731 802.491 10.7319C813.62 17.8865 821.331 27.6645 825.624 40.0658C830.076 52.3082 831.03 66.061 828.486 81.3241C825.465 99.2902 818.549 116.223 807.737 132.122C796.926 147.862 783.412 160.502 767.195 170.041ZM699.703 139.277C703.995 147.385 711.468 151.439 722.121 151.439H722.597C731.342 151.439 739.451 148.18 746.923 141.661C754.555 134.984 760.994 126.08 766.241 114.951C771.646 103.821 775.621 91.4201 778.165 77.7468C780.55 64.3915 779.596 53.6596 775.303 45.551C771.01 37.2835 763.617 33.1497 753.124 33.1497H752.647C744.538 33.1497 736.668 36.4885 729.037 43.1662C721.564 49.8438 715.045 58.8268 709.481 70.1152C703.916 81.4036 699.862 93.646 697.318 106.842C694.774 120.198 695.569 131.009 699.703 139.277Z" fill="currentColor"/>
    </svg>
  );
}

function StripeLogo() {
  return (
    <svg style={{ height: 20, width: "auto" }} viewBox="0 0 60 25" xmlns="http://www.w3.org/2000/svg" aria-label="Stripe" role="img" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M59.6444 14.2813h-8.062c.1843 1.9296 1.5983 2.5476 3.2032 2.5476 1.6352 0 2.9534-.3656 4.0453-.9506v3.3179c-1.1186.7115-2.5964 1.1068-4.5645 1.1068-4.011 0-6.8218-2.5122-6.8218-7.4783 0-4.19441 2.3837-7.52509 6.3017-7.52509 3.912 0 5.9537 3.28038 5.9537 7.49819 0 .3982-.0372 1.261-.0556 1.4835Zm-5.9241-5.62407c-1.0294 0-2.1739.72812-2.1739 2.58387h4.2573c0-1.85362-1.0721-2.58387-2.0834-2.58387ZM40.9547 20.303c-1.4411 0-2.322-.6087-2.9133-1.0417l-.0088 4.6271-4.1181.8755-.0014-19.19053h3.7543l.0864 1.01784c.6035-.52914 1.6114-1.29157 3.2256-1.29162 2.8925 0 5.6162 2.6052 5.6162 7.39971 0 5.2327-2.6948 7.6037-5.6409 7.6037Zm-.959-11.35573c-.9453 0-1.5376.34559-1.9669.81586l.0245 6.11967c.3997.433.9763.7813 1.9424.7813 1.5231 0 2.5437-1.6575 2.5437-3.8745 0-2.1544-1.037-3.84233-2.5437-3.84233Zm-11.7602-3.3739h4.1341V20.0088h-4.1341V5.57337Zm0-4.694699L32.3696 0v3.35821l-4.1341.87868V.878671ZM23.9198 10.2223v9.7861h-4.1156V5.57296h3.6867l.1317 1.21751c1.0035-1.7722 3.0722-1.41321 3.6209-1.21594v3.78524c-.5242-.16908-2.2894-.42779-3.3237.86253Zm-8.5525 4.7221c0 2.4275 2.5988 1.6719 3.1263 1.4609v3.3522c-.5492.3013-1.5437.5458-2.8901.5458-2.4441 0-4.2773-1.7999-4.2773-4.2379l.0173-13.17658 4.0206-.85464.0032 3.5395h3.1278V9.0857h-3.1278v5.8588-.0001Zm-4.9069.7026c0 2.9645-2.31051 4.6562-5.73464 4.6562-1.41958 0-2.92289-.2761-4.453935-.9347v-3.9319c1.382085.7516 3.093705 1.315 4.457755 1.315.91864 0 1.53106-.2459 1.53106-1.0069C6.26064 13.7786 0 14.5192 0 9.95995 0 7.04457 2.27622 5.2998 5.61655 5.2998c1.36404 0 2.72806.20934 4.09208.75351V9.9317c-1.25265-.67618-2.84332-1.05979-4.09588-1.05979-.86296 0-1.44753.24965-1.44753.8924.0001 1.85329 6.29518.97249 6.29518 5.88279v-.0001Z"/>
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [agentPromptCopied, setAgentPromptCopied] = useState(false);
  const router = useRouter();
  const agentPrompt = `npx mppx validate`;

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
    <div className="min-h-screen bg-[#141414] text-zinc-100 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 shrink-0">
        <div className="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-light.svg" alt="MPP" width={52} height={23} className="opacity-90" />
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-medium text-zinc-400">Validator</span>
          </div>
          <a href="https://mpp.dev" target="_blank" rel="noopener noreferrer" className="text-[14px] font-[450] text-zinc-300/80 hover:text-white transition">
            mpp.dev
          </a>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {/* Content — vertically centered */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="max-w-5xl mx-auto px-8 w-full py-16">
            <div className="flex flex-col md:flex-row md:items-start gap-10 lg:gap-16">

              {/* Left: lockup */}
              <div className="shrink-0 md:pt-1">
                <Image
                  src="/lockup-light.svg"
                  alt="MPP — Machine Payments Protocol"
                  width={560}
                  height={157}
                  className="opacity-95 h-auto"
                  style={{ width: "clamp(300px, 40vw, 560px)" }}
                  priority
                />
              </div>

              {/* Right: description, form, agent box */}
              <div className="flex-1 min-w-0">
                <p className="text-lg text-zinc-300 mb-8 max-w-md leading-relaxed">
                  Check if your API is ready for machine payments. Score discovery, protocol compliance, and accessibility.
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex gap-3">
                  <input
                    type="url"
                    required
                    placeholder="https://api.example.com"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(null); }}
                    className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-500 transition text-zinc-200 placeholder:text-zinc-600"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/30 shrink-0 cursor-pointer"
                  >
                    Check →
                  </button>
                </form>

                {error && (
                  <p className="mt-3 text-sm text-red-400">{error}</p>
                )}

                {/* Agent mode */}
                <div className="mt-8">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span className="text-xs text-zinc-600 font-mono">or</span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                  <div className="flex items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                    <pre className="text-sm font-mono text-zinc-300">{agentPrompt}</pre>
                    <button
                      type="button"
                      onClick={copyAgentPrompt}
                      className="shrink-0 text-xs font-mono text-zinc-500 hover:text-white transition cursor-pointer"
                    >
                      {agentPromptCopied ? "✓ copied" : "copy"}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Designed by footer */}
        <div className="flex justify-end px-8 pb-6">
          <div className="flex items-center gap-2 text-zinc-600 opacity-70">
            <span className="text-[10px] font-mono uppercase tracking-widest">Designed by</span>
            <a href="https://tempo.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition text-zinc-500">
              <TempoLogo />
            </a>
            <span className="text-xs">×</span>
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition text-zinc-500">
              <StripeLogo />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
