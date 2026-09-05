import { and, eq, gte, sql } from "drizzle-orm";
import { apps, impressionEvents, platformConfig, type App, type PlatformConfig } from "./schema.js";
import type { AppDb } from "./types.js";

export function computeInRecommendPool(
  app: Pick<
    App,
    | "reviewStatus"
    | "pausedByDeveloper"
    | "pausedByOps"
    | "approvedAt"
    | "contributedImpressions7d"
  >,
  config: Pick<PlatformConfig, "graceDays" | "reciprocityImpressions">,
  now = new Date(),
): boolean {
  if (app.reviewStatus !== "approved") return false;
  if (app.pausedByDeveloper || app.pausedByOps) return false;
  if (app.approvedAt) {
    const graceEnd = new Date(app.approvedAt.getTime() + config.graceDays * 24 * 60 * 60 * 1000);
    if (now < graceEnd) return true;
  }
  return app.contributedImpressions7d >= config.reciprocityImpressions;
}

export function isCatalogVisible(
  app: Pick<App, "reviewStatus" | "pausedByDeveloper" | "pausedByOps">,
): boolean {
  return app.reviewStatus === "approved" && !app.pausedByDeveloper && !app.pausedByOps;
}

export function graceDaysLeft(
  approvedAt: Date | null,
  graceDays: number,
  now = new Date(),
): number {
  if (!approvedAt) return 0;
  const graceEnd = approvedAt.getTime() + graceDays * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((graceEnd - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function getConfig(db: AppDb) {
  const rows = await db.select().from(platformConfig).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("platform_config missing");
  }
  return row;
}

export async function refreshRecommendPool(db: AppDb) {
  const config = await getConfig(db);
  const all = await db.select().from(apps);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const app of all) {
    const given = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(impressionEvents)
      .where(and(eq(impressionEvents.hostAppId, app.id), gte(impressionEvents.occurredAt, since)));
    const contributed = Number(given[0]?.count ?? 0);
    const inPool = computeInRecommendPool(
      { ...app, contributedImpressions7d: contributed },
      config,
    );
    await db
      .update(apps)
      .set({
        contributedImpressions7d: contributed,
        inRecommendPool: inPool,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, app.id));
  }
}

export async function syncAppPoolFlag(db: AppDb, appId: string) {
  const config = await getConfig(db);
  const rows = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  const app = rows[0];
  if (!app) return false;
  const inPool = computeInRecommendPool(app, config);
  await db
    .update(apps)
    .set({ inRecommendPool: inPool, updatedAt: new Date() })
    .where(eq(apps.id, appId));
  return inPool;
}
