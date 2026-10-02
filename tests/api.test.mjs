// End-to-end checks of the coordination API against a running server.
//   BASE=http://localhost:3000 node --test tests/
// Covers the Phase 1 bugs (stale dots, busy flags) and the Phase 3 rules
// (secret ids never leak, only paired peers can signal each other).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE || "http://localhost:3000";
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const poll = async (id) => { const r = await fetch(`${BASE}/api/poll?id=${id}`); return { status: r.status, ...(r.ok ? await r.json() : {}) }; };
const join = async (lat = 14.6, lng = 121) => { const id = randomUUID(); const r = await post("/api/join", { id, lat, lng }); assert.equal(r.status, 200); return { id, pub: (await r.json()).pubId }; };
const signal = (from, toPub, type, payload) => post("/api/signal", { fromId: from.id, toId: toPub, type, payload });
const leave = (u) => post("/api/leave", { id: u.id });

test("peers see public ids only, never session ids", async () => {
  const a = await join(), b = await join(10, 120);
  const seen = (await poll(a.id)).peers.map((p) => p.id);
  assert.ok(seen.includes(b.pub));
  assert.ok(!seen.includes(b.id));
  await leave(a); await leave(b);
});

test("a polled user does not keep everyone else alive (stale dots disappear)", async () => {
  const ghost = await join(), live = await join();
  await new Promise((r) => setTimeout(r, 16_000)); // STALE_MS = 15 s
  const { peers } = await poll(live.id);
  assert.ok(!peers.some((p) => p.id === ghost.pub), "ghost dot should be gone");
  await leave(live);
});

test("request → accept → end frees both users", async () => {
  const a = await join(), b = await join();
  assert.equal((await signal(a, b.pub, "request")).status, 200);
  assert.equal((await poll(b.id)).signals[0].type, "request");
  assert.equal((await signal(b, a.pub, "accept")).status, 200);
  assert.ok((await poll(a.id)).peers.find((p) => p.id === b.pub).busy);
  assert.equal((await signal(a, b.pub, "end")).status, 200);
  assert.ok(!(await poll(a.id)).peers.find((p) => p.id === b.pub).busy, "end must clear busy");
  // and b can be requested again
  const c = await join();
  await signal(c, b.pub, "request");
  assert.equal((await poll(b.id)).signals.at(-1).type, "request");
  for (const u of [a, b, c]) await leave(u);
});

test("a stranger cannot inject SDP/ICE, accept, or hang up someone else's call", async () => {
  const a = await join(), b = await join(), mallory = await join();
  await signal(a, b.pub, "request"); await signal(b, a.pub, "accept");
  assert.equal((await signal(mallory, a.pub, "offer", "{}")).status, 409);
  assert.equal((await signal(mallory, a.pub, "ice", "{}")).status, 409);
  assert.equal((await signal(mallory, a.pub, "accept")).status, 409);
  assert.equal((await signal(mallory, a.pub, "end")).status, 409);
  assert.ok((await poll(b.id)).peers.find((p) => p.id === a.pub).busy, "call still up");
  for (const u of [a, b, mallory]) await leave(u);
});

test("decline from a busy user does not mark them free", async () => {
  const a = await join(), b = await join(), c = await join();
  await signal(a, b.pub, "request"); await signal(b, a.pub, "accept");
  await signal(c, b.pub, "request"); // auto-declined by the server: b is busy
  assert.equal((await poll(c.id)).signals.at(-1).type, "decline");
  assert.ok((await poll(c.id)).peers.find((p) => p.id === b.pub).busy);
  for (const u of [a, b, c]) await leave(u);
});

test("leaving mid-call ends the call for the peer and frees them", async () => {
  const a = await join(), b = await join();
  await signal(a, b.pub, "request"); await signal(b, a.pub, "accept");
  await poll(b.id); // drain the request
  await leave(a);
  const r = await poll(b.id);
  assert.ok(r.signals.some((s) => s.type === "end" && s.fromId === a.pub));
  const c = await join();
  assert.ok(!(await poll(c.id)).peers.find((p) => p.id === b.pub).busy);
  await leave(b); await leave(c);
});

test("input validation: bad ids, oversized payload, unknown poller", async () => {
  assert.equal((await post("/api/join", { id: "x", lat: 1, lng: 1 })).status, 400);
  assert.equal((await poll("not-a-uuid")).status, 400);
  assert.equal((await poll(randomUUID())).status, 409);
  const a = await join(), b = await join();
  await signal(a, b.pub, "request"); await signal(b, a.pub, "accept");
  assert.equal((await signal(a, b.pub, "offer", "x".repeat(20_000))).status, 400);
  await leave(a); await leave(b);
});

test("block: ends the call, hides both ways, and stops new requests", async () => {
  const a = await join(), b = await join(), c = await join();
  await signal(a, b.pub, "request"); await signal(b, a.pub, "accept");
  await poll(a.id);
  assert.equal((await post("/api/block", { id: b.id, target: a.pub })).status, 200);
  assert.ok((await poll(a.id)).signals.some((s) => s.type === "end" && s.fromId === b.pub), "a is told the call ended");
  assert.ok(!(await poll(b.id)).peers.some((p) => p.id === a.pub), "b no longer sees a");
  assert.ok(!(await poll(a.id)).peers.some((p) => p.id === b.pub), "a no longer sees b");
  await signal(a, b.pub, "request");
  assert.equal((await poll(a.id)).signals.at(-1).type, "decline", "a's new request is auto-declined");
  assert.ok(!(await poll(b.id)).signals.some((s) => s.type === "request"), "b never sees it");
  assert.ok((await poll(c.id)).peers.some((p) => p.id === a.pub), "everyone else still sees a");
  for (const u of [a, b, c]) await leave(u);
});

test("rate limit: a user can't spam connection requests", async () => {
  const a = await join();
  const others = []; for (let i = 0; i < 10; i++) others.push(await join());
  const codes = [];
  for (const o of others) {
    const r = await signal(a, o.pub, "request"); codes.push(r.status);
    await signal(a, o.pub, "end"); // cancel, so the next request is allowed by pairing rules
  }
  assert.ok(codes.includes(429), `expected a 429 within 10 requests/min, got ${codes.join(",")}`);
  for (const u of [a, ...others]) await leave(u);
});
