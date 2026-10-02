import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Sliding one-minute limit backed by Postgres (serverless has no shared memory).
// Returns false when `key` already hit `max` in the last 60 s; otherwise records the hit.
export async function allow(key: string, max: number): Promise<boolean> {
  const since = new Date(Date.now() - 60_000);
  const recent = await prisma.rateHit.count({ where: { key, at: { gte: since } } });
  if (recent >= max) return false;
  await prisma.rateHit.create({ data: { key } });
  return true;
}

// Client IP as Vercel reports it, hashed so raw IPs are never stored.
export function ipKey(request: Request): string {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export const tooMany = () =>
  Response.json({ error: "slow down" }, { status: 429, headers: { "Retry-After": "60" } });
