"use client";

import { useState } from "react";

// A fixed scatter of "strangers" for the backdrop: computed once at module load
// from a tiny seeded generator, so server and client render the same field.
const FIELD = (() => {
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 70 }, () => ({ x: r() * 100, y: r() * 100, t: 2 + r() * 4, d: -r() * 6, warm: r() > 0.7 }));
})();

export default function EntryGate({ onReady }: { onReady: (lat: number, lng: number) => void }) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState("");

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser can't share a location, so we can't place you on the map.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Pulse needs your location to drop you on the map. Allow it in the address bar, then try again."
            : "We couldn't find you just now. Check your connection and try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix instead of a cached IP guess.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div className="entry-field" aria-hidden>
        {FIELD.map((p, i) => (
          <i key={i} style={{ left: `${p.x}%`, top: `${p.y}%`, ["--t" as string]: `${p.t}s`, ["--d" as string]: `${p.d}s`, ["--c" as string]: p.warm ? "var(--warm)" : "var(--pulse)" }} />
        ))}
        <div className="entry-rings">
          <span /><span /><span />
        </div>
      </div>

      <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
        <p className="rise font-mono text-[11px] uppercase tracking-[0.32em] text-pulse">Pulse</p>
        <h1 className="rise mt-5 font-serif text-5xl leading-[1.02] text-ink sm:text-7xl" style={{ animationDelay: "60ms" }}>
          Someone, somewhere,
          <br />
          <em className="text-pulse">is awake right now.</em>
        </h1>
        <p className="rise mt-6 max-w-md text-base text-muted sm:text-lg" style={{ animationDelay: "120ms" }}>
          Every glowing dot is a real stranger. Tap one to say hello. Text first, video only if you both say yes.
        </p>

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="rise group mt-10 inline-flex items-center gap-3 rounded-full bg-pulse px-8 py-4 text-base font-semibold text-bg shadow-[0_0_40px_-6px_var(--pulse)] transition hover:shadow-[0_0_60px_-4px_var(--pulse)] active:scale-[0.98] disabled:opacity-70"
          style={{ animationDelay: "180ms" }}
        >
          {status === "locating" ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-bg/30 border-t-bg" style={{ animation: "spin .8s linear infinite" }} />
              Finding you…
            </>
          ) : (
            <>
              Drop onto the map
              <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
            </>
          )}
        </button>

        {status === "error" && (
          <p role="alert" className="fade mt-5 max-w-sm rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}

        <ul className="rise mt-12 flex flex-wrap justify-center gap-2 text-xs text-muted" style={{ animationDelay: "240ms" }}>
          {["No sign-up", "Your dot is fuzzed 1–3 km", "Chat & video are peer-to-peer", "Nothing is stored"].map((t) => (
            <li key={t} className="rounded-full border border-line bg-white/[0.03] px-3 py-1.5">{t}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
