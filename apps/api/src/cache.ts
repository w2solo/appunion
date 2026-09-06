export type CacheStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export function createMemoryCache(): CacheStore {
  const store = new Map<string, { value: string; expiresAt: number }>();

  function read(key: string) {
    const row = store.get(key);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return row.value;
  }

  return {
    async get(key) {
      return read(key);
    },
    async put(key, value, options) {
      const ttlSec = Math.max(options?.expirationTtl ?? 60, 1);
      store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
    },
    async delete(key) {
      store.delete(key);
    },
  };
}
