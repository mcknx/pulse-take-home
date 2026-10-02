import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/block — body { id: <your session id>, target: <their public id> }.
// Ends any call with them, and from now on the two of you are invisible to each
// other and can't request each other (enforced in /api/poll and /api/signal).
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { id, target } = (body ?? {}) as Record<string, unknown>;
  if (!isSessionId(id) || typeof target !== "string" || target.length > 64) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }

  const me = await prisma.presence.findUnique({ where: { id } });
  if (!me) return Response.json({ error: "not joined" }, { status: 409 });
  if (target === me.pubId) return Response.json({ error: "cannot block yourself" }, { status: 400 });

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: id, blockedId: target } },
    create: { blockerId: id, blockedId: target },
    update: {},
  });

  // If we were requesting / connected / being requested, end it for both.
  const them = await prisma.presence.findUnique({ where: { pubId: target } });
  if (them && (me.peerId === them.id || them.peerId === me.id)) {
    await prisma.presence.updateMany({
      where: { OR: [{ id: me.id, peerId: them.id }, { id: them.id, peerId: me.id }] },
      data: { busy: false, peerId: null },
    });
    await prisma.signal.create({ data: { fromId: me.pubId, toId: them.id, type: "end" } });
  }
  return Response.json({ ok: true });
}
