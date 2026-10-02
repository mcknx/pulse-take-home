"use client";

import { useEffect, useRef, useState } from "react";
import { orbStyle } from "@/lib/orb";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

const Icon = {
  video: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2.5" y="6" width="13" height="12" rx="3" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></svg>,
  shield: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6L12 3Z" /><path d="m9 9 6 6M15 9l-6 6" /></svg>,
  close: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  send: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2 .1 6.4Z" /></svg>,
};

export default function ChatPanel({
  peerId,
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onBlock,
  onEnd,
}: {
  peerId: string;
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onBlock: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text.slice(0, 1000));
    setDraft("");
  }

  const iconBtn = "grid h-9 w-9 place-items-center rounded-full border border-line text-ink transition hover:bg-white/8 disabled:opacity-35";

  return (
    <section
      aria-label="Chat with a stranger"
      className="glass rise absolute inset-x-2 bottom-2 z-30 flex h-[min(72dvh,640px)] flex-col overflow-hidden rounded-3xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-6 sm:h-auto sm:w-[400px]"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <div className="h-10 w-10 shrink-0 rounded-full" style={orbStyle(peerId)} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">A stranger</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            {connected ? <><span className="live-dot" /> Connected · peer-to-peer</> : <>Opening a private line…</>}
          </p>
        </div>
        <button onClick={onStartVideo} disabled={!connected || videoBusy} className={iconBtn} title="Ask to start video" aria-label="Ask to start video">{Icon.video}</button>
        <button onClick={() => setConfirmBlock(true)} className={`${iconBtn} hover:text-danger`} title="Block" aria-label="Block this stranger">{Icon.shield}</button>
        <button onClick={onEnd} className={`${iconBtn} hover:border-danger/40 hover:text-danger`} title="End conversation" aria-label="End conversation">{Icon.close}</button>
      </header>

      {confirmBlock && (
        <div className="fade flex items-center gap-3 border-b border-danger/25 bg-danger/10 px-4 py-3 text-sm">
          <p className="flex-1 text-ink">Block them? The chat ends and you won&rsquo;t see each other again this session.</p>
          <button onClick={() => setConfirmBlock(false)} className="rounded-full px-3 py-1.5 text-muted hover:text-ink">Cancel</button>
          <button onClick={onBlock} className="rounded-full bg-danger px-3 py-1.5 font-semibold text-white">Block</button>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-5" aria-live="polite">
        <p className="mx-auto max-w-[260px] text-center text-xs leading-relaxed text-faint">
          {connected
            ? "You're talking directly. Nothing passes through our servers or is saved. Be kind — you can block anytime."
            : "Setting up a direct, private connection…"}
        </p>
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <span
              className={`rise max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                m.mine ? "rounded-br-md bg-pulse text-bg" : "rounded-bl-md bg-white/[0.07] text-ink"
              }`}
              style={{ animationDuration: ".25s" }}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Say hello…" : "Connecting…"}
          disabled={!connected}
          maxLength={1000}
          aria-label="Message"
          className="flex-1 rounded-full border border-line bg-white/[0.04] px-4 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-pulse/60 disabled:opacity-50"
        />
        <button type="submit" disabled={!connected || !draft.trim()} aria-label="Send"
          className="grid h-10 w-10 place-items-center rounded-full bg-pulse text-bg transition hover:brightness-110 active:scale-95 disabled:opacity-30">
          {Icon.send}
        </button>
      </form>
    </section>
  );
}
