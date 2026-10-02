import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id }. Removes the presence row and any pending
// signals to/from this user, and frees whoever they were paired with.
// Called via navigator.sendBeacon on tab close, so the body may arrive as
// text — parse defensively.
export async function POST(request: NextRequest) {
  let id: unknown;
  try {
    const text = await request.text();
    id = text ? JSON.parse(text)?.id : undefined;
  } catch {
    id = undefined;
  }

  if (!isSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  // Tell the peer, then free them, so a closed tab never leaves them stuck busy.
  const me = await prisma.presence.findUnique({ where: { id }, select: { pubId: true, peerId: true } });
  if (me?.peerId) {
    await prisma.signal.create({ data: { fromId: me.pubId, toId: me.peerId, type: "end" } });
    await prisma.presence.updateMany({
      where: { id: me.peerId, peerId: id },
      data: { busy: false, peerId: null },
    });
  }
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, ...(me ? [{ fromId: me.pubId, type: { not: "end" } }] : [])] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}
