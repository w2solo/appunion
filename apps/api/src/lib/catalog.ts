import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { appPlatforms, apps, getConfig, platformsForApps, type AppDb, type AppPlatformPublic } from "@appunions/db";
import { buildDownloads, supportedPlatformsOf, type ListingItem, type Platform } from "@appunions/shared";
import { pickRandom } from "./random.js";
import type { CacheStore } from "../cache.js";
import { cacheGet, cacheSet } from "../kv.js";

type AppRow = typeof apps.$inferSelect;

export function isSelfHidden(app: { pausedByDeveloper?: boolean | null }) {
  return Boolean(app.pausedByDeveloper);
}

export function hiddenRecommendResponse() {
  return { hidden: true as const, items: [] as ListingItem[] };
}

export function hiddenListResponse(page: number, pageSize: number) {
  return {
    hidden: true as const,
    items: [] as ListingItem[],
    page,
    page_size: pageSize,
    total: 0,
  };
}

export function visibleRecommendResponse(items: ListingItem[], mock = false) {
  return mock ? { hidden: false as const, items, mock: true as const } : { hidden: false as const, items };
}

export function visibleListResponse<T extends { items: unknown[] }>(data: T, mock = false) {
  return mock ? { hidden: false as const, ...data, mock: true as const } : { hidden: false as const, ...data };
}

export function listingDto(
  app: AppRow,
  platform: Platform,
  current: AppPlatformPublic,
  allPlatforms: AppPlatformPublic[],
): ListingItem {
  return {
    id: app.id,
    name: app.name,
    icon_url: app.iconUrl,
    tagline: app.tagline,
    description: app.description ?? "",
    category: app.category,
    subcategory: app.subcategory,
    platform,
    package_name: current.packageName,
    supported_platforms: supportedPlatformsOf(allPlatforms),
    downloads: buildDownloads({
      platform,
      packageName: current.packageName,
      downloadStores: current.downloadStores,
      extraDownloads: current.extraDownloads,
    }),
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

function listingsFromRows(
  platform: Platform,
  appRows: AppRow[],
  listings: Map<string, AppPlatformPublic[]>,
  order: string[],
): ListingItem[] {
  const byId = new Map(appRows.map((app) => [app.id, app]));
  return order
    .map((id) => {
      const app = byId.get(id);
      const platforms = listings.get(id) ?? [];
      const current = platforms.find((item) => item.platform === platform);
      if (!app || !current) return null;
      return listingDto(app, platform, current, platforms);
    })
    .filter((item): item is ListingItem => Boolean(item));
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
  if (picked.length === 0) return [];
  const rows = await db.select().from(apps).where(inArray(apps.id, picked));
  const listings = await platformsForApps(db, picked);
  return listingsFromRows(platform, rows, listings, picked);
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
    .select({ app: apps })
    .from(apps)
    .innerJoin(appPlatforms, eq(appPlatforms.appId, apps.id))
    .where(where)
    .orderBy(desc(apps.createdAt), desc(apps.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const appRows = rows.map((row) => row.app);
  const listings = await platformsForApps(
    db,
    appRows.map((app) => app.id),
  );
  return {
    items: listingsFromRows(
      platform,
      appRows,
      listings,
      appRows.map((app) => app.id),
    ),
    page,
    page_size: pageSize,
    total,
  };
}
