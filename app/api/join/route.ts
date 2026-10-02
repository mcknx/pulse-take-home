import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { isSessionId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, lat, lng } (raw coords).
// Applies a 1–3 km privacy offset and creates the presence row. Raw
// coordinates are never stored. Returns the caller's public id.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, lat, lng } = (body ?? {}) as Record<string, unknown>;

  if (!isSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  // The offset is drawn ONCE per session. Re-drawing it on every join would let
  // an observer average many offset dots of the same user back to the real spot.
  const offset = applyPrivacyOffset(lat as number, lng as number);
  const me = await prisma.presence.upsert({
    where: { id },
    create: { id, lat: offset.lat, lng: offset.lng, lastSeen: new Date() },
    update: { lastSeen: new Date() },
    select: { pubId: true },
  });

  return Response.json({ ok: true, pubId: me.pubId });
}
