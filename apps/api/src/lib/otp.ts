import { createHash, randomInt } from "node:crypto";
import { env } from "../env.js";
import { redis } from "../redis.js";

const TTL_SEC = 10 * 60;

function keyFor(email: string) {
  return `authcode:${email}`;
}

export function hashOtp(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}:${env.JWT_SECRET}`).digest("hex");
}

export function randomOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function saveOtp(email: string, code: string) {
  await redis.set(keyFor(email), hashOtp(email, code), "EX", TTL_SEC);
  await redis.del(`authcode:tries:${email}`);
}

export async function consumeOtp(email: string, code: string) {
  const stored = await redis.get(keyFor(email));
  if (!stored) return false;
  const triesKey = `authcode:tries:${email}`;
  const tries = await redis.incr(triesKey);
  if (tries === 1) await redis.expire(triesKey, TTL_SEC);
  if (tries > 5) {
    await redis.del(keyFor(email));
    return false;
  }
  if (stored !== hashOtp(email, code)) return false;
  await redis.del(keyFor(email), triesKey);
  return true;
}
