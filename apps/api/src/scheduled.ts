import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  anomalyFlags,
  appDailyStats,
  apps,
  clickEvents,
  impressionEvents,
  refreshRecommendPool,
} from "@appunions/db";
import { getDb } from "./db.js";
import { invalidatePoolCache } from "./kv.js";

async function runPool(env: Env) {
  const db = getDb(env.DB);
  await refreshRecommendPool(db);
  await invalidatePoolCache(env.KV);
  console.log("recommend pool refreshed");
}

async function flagAnomalies(env: Env) {
  const db = getDb(env.DB);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      appId: appDailyStats.appId,
      impressions: sql<number>`cast(coalesce(sum(${appDailyStats.impressionsReceived}), 0) as integer)`,
      clicks: sql<number>`cast(coalesce(sum(${appDailyStats.clicksReceived}), 0) as integer)`,
    })
    .from(appDailyStats)
    .where(sql`${appDailyStats.day} >= ${since}`)
    .groupBy(appDailyStats.appId);

  for (const row of rows) {
    const impressions = Number(row.impressions);
    const clicks = Number(row.clicks);
    const ctr = impressions === 0 ? 0 : clicks / impressions;
    const bad = clicks > impressions || (impressions >= 200 && ctr >= 0.5);
    if (!bad) continue;
    const open = await db
      .select()
      .from(anomalyFlags)
      .where(and(eq(anomalyFlags.appId, row.appId), isNull(anomalyFlags.resolvedAt)))
      .limit(1);
    if (open[0]) continue;
    await db.insert(anomalyFlags).values({
      appId: row.appId,
      type: clicks > impressions ? "clicks_gt_impressions" : "high_ctr",
      window: "7d",
    });
    console.log(`anomaly flagged ${row.appId}`);
  }
}

async function reconcileYesterday(env: Env) {
  const db = getDb(env.DB);
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(`${day}T23:59:59.999Z`);
  const allApps = await db.select({ id: apps.id }).from(apps);
  for (const app of allApps) {
    const givenImp = await db
      .select({ n: sql<number>`cast(count(*) as integer)` })
      .from(impressionEvents)
      .where(
        and(
          eq(impressionEvents.hostAppId, app.id),
          gte(impressionEvents.occurredAt, start),
          sql`${impressionEvents.occurredAt} <= ${end}`,
        ),
      );
    const recvImp = await db
      .select({ n: sql<number>`cast(count(*) as integer)` })
      .from(impressionEvents)
      .where(
        and(
          eq(impressionEvents.targetAppId, app.id),
          gte(impressionEvents.occurredAt, start),
          sql`${impressionEvents.occurredAt} <= ${end}`,
        ),
      );
    const givenClk = await db
      .select({ n: sql<number>`cast(count(*) as integer)` })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.hostAppId, app.id),
          gte(clickEvents.occurredAt, start),
          sql`${clickEvents.occurredAt} <= ${end}`,
        ),
      );
    const recvClk = await db
      .select({ n: sql<number>`cast(count(*) as integer)` })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.targetAppId, app.id),
          gte(clickEvents.occurredAt, start),
          sql`${clickEvents.occurredAt} <= ${end}`,
        ),
      );
    await db
      .insert(appDailyStats)
      .values({
        appId: app.id,
        day,
        impressionsGiven: Number(givenImp[0]?.n ?? 0),
        impressionsReceived: Number(recvImp[0]?.n ?? 0),
        clicksGiven: Number(givenClk[0]?.n ?? 0),
        clicksReceived: Number(recvClk[0]?.n ?? 0),
      })
      .onConflictDoUpdate({
        target: [appDailyStats.appId, appDailyStats.day],
        set: {
          impressionsGiven: Number(givenImp[0]?.n ?? 0),
          impressionsReceived: Number(recvImp[0]?.n ?? 0),
          clicksGiven: Number(givenClk[0]?.n ?? 0),
          clicksReceived: Number(recvClk[0]?.n ?? 0),
        },
      });
  }
  console.log(`reconciled ${day}`);
}

export async function runScheduled(cron: string, env: Env) {
  if (cron === "*/5 * * * *") {
    await runPool(env);
    return;
  }
  if (cron === "0 */6 * * *") {
    await flagAnomalies(env);
    return;
  }
  await reconcileYesterday(env);
}
