const KV_MIN_TTL = 60;

function ttl(seconds: number) {
  return Math.max(seconds, KV_MIN_TTL);
}

export async function rateLimit(kv: KVNamespace, key: string, limit: number, windowSec = 60) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const redisKey = `rl:${key}:${bucket}`;
  const n = Number((await kv.get(redisKey)) ?? "0") + 1;
  await kv.put(redisKey, String(n), { expirationTtl: ttl(windowSec) });
  return n <= limit;
}

export async function rememberRecent(kv: KVNamespace, hostAppId: string, ids: string[]) {
  const key = `recent:${hostAppId}`;
  const raw = await kv.get(key);
  const list: string[][] = raw ? (JSON.parse(raw) as string[][]) : [];
  list.unshift(ids);
  await kv.put(key, JSON.stringify(list.slice(0, 3)), { expirationTtl: ttl(24 * 60 * 60) });
}

export async function recentUnion(kv: KVNamespace, hostAppId: string): Promise<Set<string>> {
  const key = `recent:${hostAppId}`;
  const raw = await kv.get(key);
  const set = new Set<string>();
  if (!raw) return set;
  try {
    const rows = JSON.parse(raw) as string[][];
    for (const row of rows) {
      for (const id of row) set.add(id);
    }
  } catch {
    // ignore
  }
  return set;
}

export async function invalidatePoolCache(kv: KVNamespace, platform?: string) {
  if (platform) {
    await kv.delete(`pool:${platform}`);
    return;
  }
  await Promise.all(["android", "ios", "harmonyos"].map((p) => kv.delete(`pool:${p}`)));
}

export async function impressionDedupSet(
  kv: KVNamespace,
  hostId: string,
  targetId: string,
  clientId: string,
  ttlSec: number,
) {
  const key = `imp:${hostId}:${targetId}:${clientId}`;
  const existing = await kv.get(key);
  if (existing) return false;
  await kv.put(key, "1", { expirationTtl: ttl(ttlSec) });
  return true;
}

export async function cacheGet(kv: KVNamespace, key: string) {
  return kv.get(key);
}

export async function cacheSet(kv: KVNamespace, key: string, value: string, ttlSec: number) {
  await kv.put(key, value, { expirationTtl: ttl(ttlSec) });
}
