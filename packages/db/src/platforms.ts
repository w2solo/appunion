import { inArray } from "drizzle-orm";
import { appPlatforms } from "./schema.js";
import type { AppDb } from "./types.js";

export type AppPlatformPublic = {
  platform: string;
  packageName: string;
  downloadStores: string[];
  extraDownloads: { label: string; url: string }[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asExtraDownloads(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  const items: { label: string; url: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = "label" in item && typeof item.label === "string" ? item.label : "";
    const url = "url" in item && typeof item.url === "string" ? item.url : "";
    if (!label || !url) continue;
    items.push({ label, url });
  }
  return items;
}

export async function platformsForApps(
  db: AppDb,
  appIds: string[],
): Promise<Map<string, AppPlatformPublic[]>> {
  const map = new Map<string, AppPlatformPublic[]>();
  if (appIds.length === 0) return map;
  const rows = await db.select().from(appPlatforms).where(inArray(appPlatforms.appId, appIds));
  for (const row of rows) {
    const list = map.get(row.appId) ?? [];
    list.push({
      platform: row.platform,
      packageName: row.packageName,
      downloadStores: asStringArray(row.downloadStores),
      extraDownloads: asExtraDownloads(row.extraDownloads),
    });
    map.set(row.appId, list);
  }
  return map;
}
