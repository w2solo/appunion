import { inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { appPlatforms } from "./schema.js";

export type AppPlatformPublic = { platform: string; packageName: string };

export async function platformsForApps(
  db: PostgresJsDatabase<any>,
  appIds: string[],
): Promise<Map<string, AppPlatformPublic[]>> {
  const map = new Map<string, AppPlatformPublic[]>();
  if (appIds.length === 0) return map;
  const rows = await db.select().from(appPlatforms).where(inArray(appPlatforms.appId, appIds));
  for (const row of rows) {
    const list = map.get(row.appId) ?? [];
    list.push({ platform: row.platform, packageName: row.packageName });
    map.set(row.appId, list);
  }
  return map;
}
