import { redis } from "../redis.js";

export async function rateLimit(key: string, limit: number, windowSec = 60) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const redisKey = `rl:${key}:${bucket}`;
  const n = await redis.incr(redisKey);
  if (n === 1) await redis.expire(redisKey, windowSec);
  return n <= limit;
}

export async function rememberRecent(hostAppId: string, ids: string[]) {
  const key = `recent:${hostAppId}`;
  await redis.lpush(key, JSON.stringify(ids));
  await redis.ltrim(key, 0, 2);
  await redis.expire(key, 24 * 60 * 60);
}

export async function recentUnion(hostAppId: string): Promise<Set<string>> {
  const key = `recent:${hostAppId}`;
  const rows = await redis.lrange(key, 0, 2);
  const set = new Set<string>();
  for (const row of rows) {
    try {
      const ids = JSON.parse(row) as string[];
      for (const id of ids) set.add(id);
    } catch {
      // ignore
    }
  }
  return set;
}

export async function invalidatePoolCache(platform?: string) {
  if (platform) {
    await redis.del(`pool:${platform}`);
    return;
  }
  await redis.del("pool:android", "pool:ios", "pool:harmonyos");
}

export async function impressionDedupSet(
  hostId: string,
  targetId: string,
  clientId: string,
  ttlSec: number,
) {
  const key = `imp:${hostId}:${targetId}:${clientId}`;
  const ok = await redis.set(key, "1", "EX", ttlSec, "NX");
  return ok === "OK";
}
