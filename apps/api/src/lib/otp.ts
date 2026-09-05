import { createHash, randomInt } from "node:crypto";

const TTL_SEC = 10 * 60;

function keyFor(email: string) {
  return `authcode:${email}`;
}

export function hashOtp(secret: string, email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
}

export function randomOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function saveOtp(kv: KVNamespace, secret: string, email: string, code: string) {
  await kv.put(keyFor(email), hashOtp(secret, email, code), { expirationTtl: TTL_SEC });
  await kv.delete(`authcode:tries:${email}`);
}

export async function consumeOtp(kv: KVNamespace, secret: string, email: string, code: string) {
  const stored = await kv.get(keyFor(email));
  if (!stored) return false;
  const triesKey = `authcode:tries:${email}`;
  const tries = Number((await kv.get(triesKey)) ?? "0") + 1;
  await kv.put(triesKey, String(tries), { expirationTtl: TTL_SEC });
  if (tries > 5) {
    await kv.delete(keyFor(email));
    return false;
  }
  if (stored !== hashOtp(secret, email, code)) return false;
  await kv.delete(keyFor(email));
  await kv.delete(triesKey);
  return true;
}
