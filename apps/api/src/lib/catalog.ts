import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { appPlatforms, apps, getConfig, type AppDb } from "@appunions/db";
import { type Platform } from "@appunions/shared";
import { pickRandom } from "./random.js";
import type { CacheStore } from "../cache.js";
import { cacheGet, cacheSet } from "../kv.js";

type AppRow = typeof apps.$inferSelect;

export function listingDto(app: AppRow, platform: Platform, packageName: string) {
  return {
    id: app.id,
    name: app.name,
    icon_url: app.iconUrl,
    tagline: app.tagline,
    category: app.category,
    subcategory: app.subcategory,
    platform,
    package_name: packageName,
  };
}

export async function hostHasPlatform(db: AppDb, hostId: string, platform: Platform) {
  const rows = await db
    .select({ id: appPlatforms.id })
    .from(appPlatforms)
    .where(and(eq(appPlatforms.appId, hostId), eq(appPlatforms.platform, platform)))
    .limit(1);
  return Boolean(rows[0]);
}

async function poolIds(db: AppDb, kv: CacheStore, platform: Platform, cacheSec: number) {
  const cacheKey = `pool:${platform}`;
  const cached = await cacheGet(kv, cacheKey);
  if (cached) return JSON.parse(cached) as string[];
  const rows = await db
    .select({ id: apps.id })
    .from(apps)
    .innerJoin(appPlatforms, eq(appPlatforms.appId, apps.id))
    .where(and(eq(appPlatforms.platform, platform), eq(apps.inRecommendPool, true)));
  const ids = rows.map((r) => r.id);
  await cacheSet(kv, cacheKey, JSON.stringify(ids), cacheSec);
  return ids;
}

export async function recommendItems(
  db: AppDb,
  kv: CacheStore,
  hostId: string,
  platform: Platform,
  limit: number,
) {
  const config = await getConfig(db);
  const ids = (await poolIds(db, kv, platform, config.recommendCacheSeconds)).filter((id) => id !== hostId);
  const picked = pickRandom(ids, limit);
  const rows =
    picked.length === 0
      ? []
      : await db
          .select({ app: apps, packageName: appPlatforms.packageName })
          .from(apps)
          .innerJoin(
            appPlatforms,
            and(eq(appPlatforms.appId, apps.id), eq(appPlatforms.platform, platform)),
          )
          .where(inArray(apps.id, picked));
  const byId = new Map(rows.map((r) => [r.app.id, r]));
  return picked
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => Boolean(r))
    .map((r) => listingDto(r.app, platform, r.packageName));
}

export async function listItems(
  db: AppDb,
  hostId: string,
  platform: Platform,
  page: number,
  pageSize: number,
) {
  const where = and(
    eq(appPlatforms.platform, platform),
    eq(apps.reviewStatus, "approved"),
    eq(apps.pausedByDeveloper, false),
    eq(apps.pausedByOps, false),
    ne(apps.id, hostId),
  );
  const countRows = await db
    .select({ n: sql<number>`cast(count(*) as integer)` })
    .from(apps)
    .innerJoin(appPlatforms, eq(appPlatforms.appId, apps.id))
    .where(where);
  const total = Number(countRows[0]?.n ?? 0);
  const rows = await db
    .select({ app: apps, packageName: appPlatforms.packageName })
    .from(apps)
    .innerJoin(appPlatforms, eq(appPlatforms.appId, apps.id))
    .where(where)
    .orderBy(desc(apps.createdAt), desc(apps.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    items: rows.map((r) => listingDto(r.app, platform, r.packageName)),
    page,
    page_size: pageSize,
    total,
  };
}
