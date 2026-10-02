import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS, BLOCK_TTL_MS } from "@/lib/presence";
import { isSessionId } from "@/lib/ids";
import type { PollResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id= — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers (public ids only), and (4) drains
// this user's mailbox.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!isSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller only. An unknown id (the
  // row was reaped, or never joined) must re-join rather than poll others.
  const beat = await prisma.presence.updateMany({
    where: { id },
    data: { lastSeen: new Date(now) },
  });
  if (beat.count === 0) {
    return Response.json({ error: "not joined" }, { status: 409 });
  }

  // 2) Reap stale presence rows and orphaned signals (independent deletes —
  // no atomicity needed, and avoids transactions over a PgBouncer pooler).
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });
  // ponytail: blocks are swept by age, not by the blocker going stale; fine
  // because a session id is never reused. Join-time cleanup if this grows.
  await prisma.rateHit.deleteMany({ where: { at: { lt: new Date(now - 5 * 60_000) } } });
  await prisma.block.deleteMany({ where: { createdAt: { lt: new Date(now - BLOCK_TTL_MS) } } });

  // If my peer was reaped (tab closed without a clean leave), free me.
  const me = await prisma.presence.findUnique({ where: { id }, select: { pubId: true, peerId: true } });
  if (me?.peerId && !(await prisma.presence.findUnique({ where: { id: me.peerId }, select: { id: true } }))) {
    await prisma.presence.update({ where: { id }, data: { busy: false, peerId: null } });
  }

  // 3) Online peers, excluding self — public ids only. Blocks hide both ways:
  // people I blocked, and people who blocked me.
  const iBlocked = await prisma.block.findMany({ where: { blockerId: id }, select: { blockedId: true } });
  const blockedMe = await prisma.block.findMany({ where: { blockedId: me!.pubId }, select: { blockerId: true } });
  const peers = await prisma.presence.findMany({
    where: {
      id: { notIn: [id, ...blockedMe.map((b) => b.blockerId)] },
      pubId: { notIn: iBlocked.map((b) => b.blockedId) },
      lastSeen: { gte: staleCutoff },
    },
    select: { pubId: true, lat: true, lng: true, busy: true },
  });

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({ where: { id: { in: inbox.map((s) => s.id) } } });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({ id: p.pubId, lat: p.lat, lng: p.lng, busy: p.busy })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId, // already a public id
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
