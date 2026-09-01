import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Redis from "ioredis";
import {
  anomalyFlags,
  appDailyStats,
  apps,
  clickEvents,
  impressionEvents,
  refreshRecommendPool,
} from "@appunions/db";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error("DATABASE_URL and REDIS_URL required");
}

const sqlClient = postgres(databaseUrl);
const db = drizzle(sqlClient);
const redis = new Redis(redisUrl);

async function invalidatePool() {
  await redis.del("pool:android", "pool:ios", "pool:harmonyos");
}

async function runPool() {
  await refreshRecommendPool(db);
  await invalidatePool();
  console.log("recommend pool refreshed");
}

async function flagAnomalies() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      appId: appDailyStats.appId,
      impressions: sql<number>`coalesce(sum(${appDailyStats.impressionsReceived}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${appDailyStats.clicksReceived}), 0)::int`,
    })
    .from(appDailyStats)
    .where(sql`${appDailyStats.day} >= ${since}`)
    .groupBy(appDailyStats.appId);

  for (const row of rows) {
    const ctr = row.impressions === 0 ? 0 : row.clicks / row.impressions;
    const bad = row.clicks > row.impressions || (row.impressions >= 200 && ctr >= 0.5);
    if (!bad) continue;
    const open = await db
      .select()
      .from(anomalyFlags)
      .where(and(eq(anomalyFlags.appId, row.appId), isNull(anomalyFlags.resolvedAt)))
      .limit(1);
    if (open[0]) continue;
    await db.insert(anomalyFlags).values({
      appId: row.appId,
      type: row.clicks > row.impressions ? "clicks_gt_impressions" : "high_ctr",
      window: "7d",
    });
    console.log(`anomaly flagged ${row.appId}`);
  }
}

async function reconcileYesterday() {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(`${day}T23:59:59.999Z`);
  const allApps = await db.select({ id: apps.id }).from(apps);
  for (const app of allApps) {
    const givenImp = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(impressionEvents)
      .where(
        and(
          eq(impressionEvents.hostAppId, app.id),
          gte(impressionEvents.occurredAt, start),
          sql`${impressionEvents.occurredAt} <= ${end}`,
        ),
      );
    const recvImp = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(impressionEvents)
      .where(
        and(
          eq(impressionEvents.targetAppId, app.id),
          gte(impressionEvents.occurredAt, start),
          sql`${impressionEvents.occurredAt} <= ${end}`,
        ),
      );
    const givenClk = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.hostAppId, app.id),
          gte(clickEvents.occurredAt, start),
          sql`${clickEvents.occurredAt} <= ${end}`,
        ),
      );
    const recvClk = await db
      .select({ n: sql<number>`count(*)::int` })
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
        impressionsGiven: givenImp[0]?.n ?? 0,
        impressionsReceived: recvImp[0]?.n ?? 0,
        clicksGiven: givenClk[0]?.n ?? 0,
        clicksReceived: recvClk[0]?.n ?? 0,
      })
      .onConflictDoUpdate({
        target: [appDailyStats.appId, appDailyStats.day],
        set: {
          impressionsGiven: givenImp[0]?.n ?? 0,
          impressionsReceived: recvImp[0]?.n ?? 0,
          clicksGiven: givenClk[0]?.n ?? 0,
          clicksReceived: recvClk[0]?.n ?? 0,
        },
      });
  }
  console.log(`reconciled ${day}`);
}

await runPool();
await flagAnomalies();

setInterval(() => {
  runPool().catch((err) => console.error(err));
}, 5 * 60 * 1000);

setInterval(
  () => {
    flagAnomalies().catch((err) => console.error(err));
  },
  6 * 60 * 60 * 1000,
);

setInterval(
  () => {
    reconcileYesterday().catch((err) => console.error(err));
  },
  24 * 60 * 60 * 1000,
);

console.log("worker started");
