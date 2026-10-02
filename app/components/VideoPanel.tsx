"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen call. Safety by default: the stranger's video arrives BLURRED and
// stays that way until you choose to see it (one tap re-blurs). You can mute or
// hide your camera without ending the call.
export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
  onToggleMic,
  onToggleCam,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
  onToggleMic: (on: boolean) => void;
  onToggleCam: (on: boolean) => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) localRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const ctl = "grid h-12 w-12 place-items-center rounded-full border border-line bg-white/[0.06] text-ink backdrop-blur transition hover:bg-white/12";

  return (
    <div className="fade absolute inset-0 z-50 bg-black" role="dialog" aria-label="Video call">
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        data-testid="remote-video"
        className="h-full w-full bg-bg object-cover transition-[filter] duration-500"
        style={{ filter: revealed ? "none" : "blur(32px) brightness(0.7)" }}
      />

      {!remoteStream && (
        <div className="absolute inset-0 grid place-items-center text-muted">
          <p className="flex items-center gap-3"><span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-pulse" style={{ animation: "spin .8s linear infinite" }} /> Waiting for their camera…</p>
        </div>
      )}

      {remoteStream && !revealed && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="glass rise max-w-sm rounded-3xl p-6 text-center">
            <p className="font-serif text-2xl text-ink">Their video is blurred</p>
            <p className="mt-2 text-sm text-muted">You decide when to see a stranger. If anything feels off, end the call — they&rsquo;ll never know what you saw.</p>
            <button onClick={() => setRevealed(true)} className="mt-5 rounded-full bg-pulse px-6 py-3 text-sm font-semibold text-bg">Show their video</button>
          </div>
        </div>
      )}

      <video
        ref={localRef}
        autoPlay
        playsInline
        muted
        className="absolute right-4 top-4 h-44 w-32 rounded-2xl border border-white/15 bg-bg object-cover shadow-2xl sm:h-52 sm:w-40"
        style={{ transform: "scaleX(-1)", opacity: cam ? 1 : 0.25 }}
      />

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button className={ctl} onClick={() => { setMic(!mic); onToggleMic(!mic); }} aria-pressed={!mic} aria-label={mic ? "Mute microphone" : "Unmute microphone"} title={mic ? "Mute" : "Unmute"}>
          {mic ? "🎙️" : <span className="text-danger">🔇</span>}
        </button>
        <button className={ctl} onClick={() => { setCam(!cam); onToggleCam(!cam); }} aria-pressed={!cam} aria-label={cam ? "Turn camera off" : "Turn camera on"} title={cam ? "Camera off" : "Camera on"}>
          {cam ? "📷" : <span className="opacity-50">📷</span>}
        </button>
        {remoteStream && revealed && (
          <button className={ctl} onClick={() => setRevealed(false)} aria-label="Blur their video" title="Blur their video">🫥</button>
        )}
        <button onClick={onEnd} className="rounded-full bg-danger px-6 font-semibold text-white transition hover:brightness-110">End video</button>
      </div>
    </div>
  );
}
