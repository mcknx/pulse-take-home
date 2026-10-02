import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionId } from "@/lib/ids";
import type { SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = ["request", "accept", "decline", "offer", "answer", "ice", "end"];

const MAX_PAYLOAD = 16 * 1024; // an SDP is a few KB; ICE candidates are tiny.
const MAX_MAILBOX = 100; // pending signals per recipient before we refuse more

// POST /api/signal — body { fromId: <your session id>, toId: <their public id>, type, payload? }
// Drops one message into the recipient's mailbox. The server tracks who is
// paired with whom (`peerId`) and only lets each signal through when it fits
// that state, so a stranger cannot inject SDP/ICE, accept on someone else's
// behalf, or hang up a call they are not in.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { fromId, toId, type, payload } = (body ?? {}) as Record<string, unknown>;

  if (!isSessionId(fromId) || typeof toId !== "string" || toId.length > 64) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }
  if (payload !== undefined && payload !== null && (typeof payload !== "string" || payload.length > MAX_PAYLOAD)) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const signalType = type as SignalType;
  const payloadStr = typeof payload === "string" ? payload : null;

  const me = await prisma.presence.findUnique({ where: { id: fromId } });
  if (!me) return Response.json({ error: "not joined" }, { status: 409 });
  const target = await prisma.presence.findUnique({ where: { pubId: toId } });

  const deliver = async (to: string, t: SignalType, p: string | null = null) => {
    await prisma.signal.create({ data: { fromId: me.pubId, toId: to, type: t, payload: p } });
  };
  const reject = (error: string, status = 409) => Response.json({ error }, { status });

  if (signalType === "request") {
    if (!target || target.id === me.id) {
      // Target went offline — tell the initiator it was declined.
      await prisma.signal.create({ data: { fromId: toId, toId: me.id, type: "decline" } });
      return Response.json({ ok: true, autoDeclined: true });
    }
    // Compare-and-set: I can only hold one request / connection at a time.
    const claimed = await prisma.presence.updateMany({
      where: { id: me.id, peerId: null, busy: false },
      data: { peerId: target.id },
    });
    if (claimed.count === 0) return reject("already in a connection");
    if (target.busy || target.peerId) {
      await prisma.presence.update({ where: { id: me.id }, data: { peerId: null } });
      await prisma.signal.create({ data: { fromId: target.pubId, toId: me.id, type: "decline" } });
      return Response.json({ ok: true, autoDeclined: true });
    }
  } else {
    if (!target) return reject("peer is gone", 410);
    const theyAskedMe = target.peerId === me.id;
    const paired = me.peerId === target.id && theyAskedMe;

    if (signalType === "accept") {
      if (!theyAskedMe) return reject("no pending request from this peer");
      const ok = await prisma.presence.updateMany({
        where: { id: me.id, peerId: null, busy: false },
        data: { peerId: target.id, busy: true },
      });
      if (ok.count === 0) return reject("already in a connection");
      await prisma.presence.updateMany({ where: { id: target.id, peerId: me.id }, data: { busy: true } });
    } else if (signalType === "decline") {
      if (!theyAskedMe) return reject("no pending request from this peer");
      await prisma.presence.updateMany({ where: { id: target.id, peerId: me.id }, data: { peerId: null } });
    } else if (signalType === "end") {
      if (me.peerId !== target.id && !theyAskedMe) return reject("not connected to this peer");
      await prisma.presence.updateMany({
        where: { OR: [{ id: me.id, peerId: target.id }, { id: target.id, peerId: me.id }] },
        data: { busy: false, peerId: null },
      });
    } else if (!paired) {
      return reject("not connected to this peer"); // offer / answer / ice
    }
  }

  if (!target) return Response.json({ ok: true });
  const pending = await prisma.signal.count({ where: { toId: target.id } });
  if (pending >= MAX_MAILBOX) return reject("mailbox full", 429);

  await deliver(target.id, signalType, payloadStr);
  return Response.json({ ok: true });
}
