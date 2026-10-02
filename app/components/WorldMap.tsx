"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import { hueOf } from "@/lib/orb";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once: a night globe that swings round and flies to you.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        center: me ? [me.lng - 40, me.lat] : [0, 20],
        zoom: 1.6,
        attributionControl: true,
      });
      map.on("error", (e) => {
        if (String(e?.error?.message ?? "").match(/token|401|403/i)) setMapError(true);
      });
      map.on("style.load", () => {
        map.setFog({
          color: "rgb(12, 16, 28)",
          "high-color": "rgb(26, 44, 74)",
          "horizon-blend": 0.06,
          "space-color": "rgb(4, 6, 12)",
          "star-intensity": 0.55,
        });
      });
      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        // Arrive: swing the globe round to the user, like dropping in.
        if (me) map.flyTo({ center: [me.lng, me.lat], zoom: 3.2, duration: 3200, curve: 1.6, essential: true });
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The user's own marker: a soft mint beacon (never the raw spot for others — it's local only).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.setAttribute("aria-label", "You");
        el.innerHTML = `<div class="pulse-me"><span class="pulse-me-label">You</span></div>`;
        meMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          // Mapbox positions the marker element with `transform`, so the
          // animated dot lives INSIDE a plain wrapper; animating the element
          // itself would overwrite its position and pin it to the corner.
          const wrap = document.createElement("div");
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.dataset.new = "true";
          el.style.setProperty("--c", `hsl(${hueOf(peer.id)} 90% 64%)`);
          el.style.setProperty("--d", `${-(hueOf(peer.id) % 24) / 10}s`);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current && el.dataset.busy !== "true") onPeerClickRef.current(peer.id);
          });
          wrap.appendChild(el);
          marker = new mapboxgl.Marker({ element: wrap }).setLngLat([peer.lng, peer.lat]).addTo(map);
          markers.set(peer.id, marker);
        }
        const el = marker.getElement().firstElementChild as HTMLElement;
        el.dataset.busy = String(peer.busy);
        el.title = peer.busy ? "In a conversation" : "Tap to say hi";
        el.setAttribute("aria-label", peer.busy ? "Stranger, busy" : "Stranger, tap to connect");
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  const free = peers.filter((p) => !p.busy).length;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-bg" />

      {(!TOKEN || mapError) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="glass max-w-md rounded-2xl p-5 text-sm text-ink">
            The map needs a Mapbox token. Set <code className="text-pulse">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> (and in Vercel), then reload.
          </p>
        </div>
      )}

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-4 pr-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-pulse">Pulse</span>
          <span className="h-4 w-px bg-line" />
          <span className="live-dot" aria-hidden />
          <span className="text-sm text-ink" aria-live="polite">
            <b className="font-semibold">{peers.length}</b> <span className="text-muted">{peers.length === 1 ? "stranger" : "strangers"} online</span>
          </span>
        </div>
      </div>

      {canConnect && (
        <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-muted fade">
          {peers.length === 0
            ? "It's quiet right now. Open Pulse in a second window to meet yourself."
            : free === 0
              ? "Everyone's mid-conversation. Hang on a moment."
              : "Tap a glowing dot to say hello."}
        </p>
      )}
    </div>
  );
}
