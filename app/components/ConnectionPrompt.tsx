"use client";

import { useEffect, useState } from "react";
import { orbStyle } from "@/lib/orb";

// Centered card for "someone wants to connect" and "someone wants to start video".
// `seconds` shows a draining ring so the user knows the request won't wait forever.
export default function ConnectionPrompt({
  peerId,
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
  onBlock,
  seconds,
}: {
  peerId?: string;
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  onBlock?: () => void;
  seconds?: number;
}) {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    if (!seconds) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  return (
    <div className="fade absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="glass rise w-full max-w-sm rounded-3xl p-7 text-center">
        {peerId && (
          <div className="relative mx-auto mb-5 h-16 w-16">
            <div className="h-16 w-16 rounded-full" style={orbStyle(peerId)} />
            {seconds ? (
              <svg className="absolute -inset-2 h-20 w-20 -rotate-90" viewBox="0 0 80 80" aria-hidden>
                <circle cx="40" cy="40" r="37" fill="none" stroke="var(--line)" strokeWidth="2" />
                <circle cx="40" cy="40" r="37" fill="none" stroke="var(--pulse)" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 37} strokeDashoffset={2 * Math.PI * 37 * (1 - left / seconds)} style={{ transition: "stroke-dashoffset 1s linear" }} />
              </svg>
            ) : null}
          </div>
        )}
        <h2 className="font-serif text-3xl leading-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-7 flex gap-3">
          <button onClick={onDecline} className="flex-1 rounded-full border border-line px-4 py-3 text-sm font-medium text-ink transition hover:bg-white/5">
            {declineLabel}
          </button>
          <button onClick={onAccept} autoFocus className="flex-1 rounded-full bg-pulse px-4 py-3 text-sm font-semibold text-bg shadow-[0_0_30px_-8px_var(--pulse)] transition hover:brightness-110 active:scale-[0.98]">
            {acceptLabel}
          </button>
        </div>
        {onBlock && (
          <button onClick={onBlock} className="mt-4 text-xs text-muted underline-offset-4 transition hover:text-danger hover:underline">
            Decline and block this stranger
          </button>
        )}
      </div>
    </div>
  );
}
