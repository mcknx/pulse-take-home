# NOTES — Pulse take-home

**Live:** https://pulse-take-home-ten.vercel.app · **Repo:** https://github.com/mcknx/pulse-take-home

**Tests:**
- `BASE=<url> npm test`: 8 API checks against a running server.
- `BASE=<url> node tests/e2e-two-users.mjs`: two real browsers with fake cameras, from joining through blocking. Screenshots go to `docs/proof/`.
- Both pass against the live deployment.

Commits follow the phases: `fix(...)` = Phase 1, `design:` = Phase 2, `security:` / `privacy:` = Phase 3, `feat(safety)` = Phase 4.

---

## Phase 1 — Make it run

How I found them: read the server routes, then followed one connection end to end (join → poll → request → accept → offer/answer/ICE → chat → video → end), checking what each side sends against what the other side expects.

| What users saw | Cause | Fix |
|---|---|---|
| Dots stayed on the map after everyone left (the example) | The poll heartbeat ran `updateMany({ where: {} })`, so **every poll refreshed every user**. Nobody ever went stale. | Heartbeat only the caller (`where: { id }`). |
| Chat messages never arrived | Sender tagged messages `t: "msg"`; the receiver only accepts `t: "chat"`. | Send `t: "chat"`. |
| Calls failed or stalled on many networks | Queued ICE candidates were flushed **before** `setRemoteDescription`, so `addIceCandidate` threw (swallowed) and early candidates were lost. | Set the remote description first, then flush. |
| After one chat, you could never be reached again | `end` didn't clear `busy`; only `decline` did. Both users stayed "busy" and every later request was auto-declined. | `end` frees both peers. |
| Someone mid-chat showed as free and kept getting requests | A busy user auto-declines stray requests, and `decline` reset `busy=false` for **both** ids, including the person mid-chat. | `decline` no longer touches `busy`. |
| Map silently broken without a token | A fake fallback Mapbox token meant the "set your token" hint never showed. | Removed the fallback. |

Also: a tab that slept past the heartbeat used to keep polling as a ghost; poll now returns 409 for unknown sessions and the client re-joins.

## Phase 2 — Make it good

The idea: **a night globe that feels inhabited**, calm enough that talking to a stranger feels safe.

- **Arrival:** an entry screen with a breathing field of dots, one clear promise ("Someone, somewhere, is awake right now"), and the privacy facts as small chips instead of fine print.
- **Map:** Mapbox **globe projection** with fog and stars that swings round and flies to you. Every stranger keeps **one hue everywhere** (dot, request card, chat avatar), so you know who you're talking to without names. Busy dots go grey and can't be tapped. There's a live count and a hint that changes when the map is empty or everyone is busy.
- **Conversation:** a floating glass chat panel (a bottom sheet on phones) with icon actions, a request card with a **countdown ring** (requests time out after 30 s), clear copy at every step ("Video only starts if you both agree").
- **Polish:** one accent colour, Instrument Serif for display type, motion on arrival and messages, `prefers-reduced-motion` respected, focus rings, aria labels and live regions.

## Phase 3 — Make it secure

Ranked by impact:

1. **Critical: session ids were the only credential, and the API handed them to everyone.** `/api/poll` returned every peer's session id. With that, anyone could poll another user's mailbox (reading their SDP/ICE, which includes **IP addresses**), send signals as them, accept on their behalf, or hang up their calls. **Fixed:** each presence gets a separate random `pubId`; clients only ever see pubIds, and the session id stays a secret the owner holds.
2. **High: no server-side connection state.** Anyone could send `offer`/`ice`/`accept`/`end` to anyone. **Fixed:** `Presence.peerId` tracks who is requesting or connected to whom; each signal type is only delivered when it fits that state, using compare-and-set updates so two requests can't double-book a user.
3. **High: location averaging.** Each re-join re-randomised the 1–3 km offset, so watching a user re-appear lets you average back toward their real position. **Fixed:** the offset is drawn once per session.
4. **Medium: abuse/DoS.** 64 KB payloads, unbounded mailboxes. **Fixed:** 16 KB cap, 100 pending messages per mailbox, strict UUID validation everywhere, a 409 for unknown pollers.
5. **Medium: leaving left the peer stuck busy.** **Fixed:** leave sends `end` and frees the peer; a reaped peer frees the survivor on their next poll.
6. **Low: browser hardening.** Added `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, a `Permissions-Policy` limiting camera/mic/location to this origin, HSTS, and no `x-powered-by`.

**Not fixed (and why):**
- **No rate limiting per IP.** Serverless has no shared memory; it needs Upstash/Vercel KV or the platform firewall. Next step.
- **WebRTC reveals each peer's IP to the other.** That's inherent to peer-to-peer with STUN only. A TURN relay (forced relay) would hide it.
- The Mapbox token is public by design; restrict it to the deployed URL in the Mapbox dashboard.

## Phase 4 — Make it better: "Safe by default"

Anonymous video with strangers has one obvious failure mode: you see something you didn't agree to. So the feature is **consent before you see anyone, and a one-tap exit that sticks.**

- **Blurred until you choose.** A stranger's video arrives blurred with a short explanation; you tap **Show their video** when you're ready, and one tap re-blurs it. Your own camera only starts when you accept the call.
- **Block that the server enforces.** One tap, from the chat header or straight from the incoming request card ("Decline and block"). The server ends the call, hides the two of you from each other's maps, and auto-declines any later request between you. It's stored in Postgres like presence, not trusted to the client, and swept with the session.
- **Mute mic / hide camera** without ending the call.

How I chose it: I used jev (TypeSafe's judgment model) to compare five candidate features. None cleared 0.80 confidence. This one scored highest (0.72 vs 0.62 for animated "live connection arcs"), and safety felt like the more honest product decision for an anonymous-video app.

**Next, with more time:** a short-lived "someone just connected" ripple on the globe (it makes the world feel alive without revealing who); reports that feed a moderation queue; and an auto-blur that re-blurs video when the stranger's camera suddenly changes scene.

## Engineering notes

- **Found while testing on the real map:** stranger dots were pinned to the top-left corner. Mapbox positions the marker with `transform`, and the dot's own animation overwrote it. Fixed with a wrapper element.

- **Prisma 7 / Next 16:** migrations live in `prisma/migrations` (two new ones: `pubId`/`peerId` and `Block`). The `pubId` migration clears `Presence` first, which is fine because those rows only live for 15 s.
- **Tests:** `tests/api.test.mjs` drives the real API with several fake users: stale dots disappear, `end` frees both users, a stranger can't inject signals or hang up a call, leaving mid-call frees the peer, block works both ways, and bad input is rejected.
- **AI use:** Claude Code for speed, jev for decisions. Every security rule above has a test that fails if it breaks.
