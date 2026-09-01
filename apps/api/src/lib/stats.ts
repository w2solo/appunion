import { and, eq, sql } from "drizzle-orm";
import { appDailyStats } from "@appunions/db/schema";
import { db } from "../db.js";

export function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function bumpStats(input: {
  hostId: string;
  targetId: string;
  impression?: boolean;
  click?: boolean;
  day?: string;
}) {
  const day = input.day ?? utcDay();

  await db
    .insert(appDailyStats)
    .values({
      appId: input.hostId,
      day,
      impressionsGiven: input.impression ? 1 : 0,
      clicksGiven: input.click ? 1 : 0,
      impressionsReceived: 0,
      clicksReceived: 0,
    })
    .onConflictDoUpdate({
      target: [appDailyStats.appId, appDailyStats.day],
      set: {
        impressionsGiven: input.impression
          ? sql`${appDailyStats.impressionsGiven} + 1`
          : appDailyStats.impressionsGiven,
        clicksGiven: input.click ? sql`${appDailyStats.clicksGiven} + 1` : appDailyStats.clicksGiven,
      },
    });

  await db
    .insert(appDailyStats)
    .values({
      appId: input.targetId,
      day,
      impressionsReceived: input.impression ? 1 : 0,
      clicksReceived: input.click ? 1 : 0,
      impressionsGiven: 0,
      clicksGiven: 0,
    })
    .onConflictDoUpdate({
      target: [appDailyStats.appId, appDailyStats.day],
      set: {
        impressionsReceived: input.impression
          ? sql`${appDailyStats.impressionsReceived} + 1`
          : appDailyStats.impressionsReceived,
        clicksReceived: input.click
          ? sql`${appDailyStats.clicksReceived} + 1`
          : appDailyStats.clicksReceived,
      },
    });
}

export async function receivedImpressionsSince(appId: string, days: number) {
  const since = utcDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${appDailyStats.impressionsReceived}), 0)::int`,
    })
    .from(appDailyStats)
    .where(and(eq(appDailyStats.appId, appId), sql`${appDailyStats.day} >= ${since}`));
  return rows[0]?.total ?? 0;
}
