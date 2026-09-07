import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  apiKeys,
  appDailyStats,
  appPlatforms,
  apps,
  getConfig,
  graceDaysLeft,
  isUniqueViolation,
  listCategoryTree,
  platformsForApps,
  syncAppPoolFlag,
  upsertCategoryPair,
} from "@appunions/db";
import {
  DESCRIPTION_MAX_GRAPHEMES,
  ERROR_CODES,
  ICON_MAX_BYTES,
  LIST_DEFAULT_PAGE_SIZE,
  LIST_MAX_PAGE_SIZE,
  LIST_SIZE_DEFAULT,
  LIST_SIZE_MAX,
  LIST_SIZE_MIN,
  PLATFORMS,
  TAGLINE_MAX_GRAPHEMES,
  graphemeLength,
  isValidCategoryName,
  isValidPackageName,
  parseDownloadStores,
  parseExtraDownloads,
} from "@appunions/shared";
import { getDb } from "../db.js";
import { readJson, routeParam, type AppEnv } from "../context.js";
import { HttpError, sendError } from "../errors.js";
import { generateApiKey } from "../lib/api-keys.js";
import {
  hiddenListResponse,
  hiddenRecommendResponse,
  hostHasPlatform,
  isSelfHidden,
  listItems,
  recommendItems,
  visibleListResponse,
  visibleRecommendResponse,
} from "../lib/catalog.js";
import { mockList, mockRecommend } from "../lib/mock-catalog.js";
import { parsePlatformsPayload } from "../lib/platform-params.js";
import { mustUser, requireUser } from "../lib/session.js";
import { invalidatePoolCache } from "../kv.js";
import { uploadIcon } from "../icons.js";
import { utcDay } from "../lib/stats.js";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  tagline: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().min(1).optional(),
  subcategory: z.string().min(1).optional(),
  listSize: z.number().int().min(LIST_SIZE_MIN).max(LIST_SIZE_MAX).optional(),
});

function publicFields(app: typeof apps.$inferSelect) {
  return {
    id: app.id,
    name: app.name,
    iconUrl: app.iconUrl,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    subcategory: app.subcategory,
    listSize: app.listSize,
  };
}

async function ownedApp(db: ReturnType<typeof getDb>, developerId: string, appId: string) {
  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.developerId, developerId)))
    .limit(1);
  return rows[0] ?? null;
}

async function keyPrefix(db: ReturnType<typeof getDb>, appId: string) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.appId, appId), sql`${apiKeys.revokedAt} is null`))
    .limit(1);
  return rows[0]?.keyPrefix ?? "";
}

async function present(c: Context<AppEnv>, app: typeof apps.$inferSelect) {
  const db = getDb(c.env.DB);
  const config = await getConfig(db);
  const left = graceDaysLeft(app.approvedAt, config.graceDays);
  const gap = Math.max(0, config.reciprocityImpressions - app.contributedImpressions7d);
  const listings = await platformsForApps(db, [app.id]);
  return {
    ...publicFields(app),
    platforms: listings.get(app.id) ?? [],
    reviewStatus: app.reviewStatus,
    pausedByDeveloper: app.pausedByDeveloper,
    pausedByOps: app.pausedByOps,
    rejectedReason: app.rejectedReason,
    approvedAt: app.approvedAt,
    inRecommendPool: app.inRecommendPool,
    contributedImpressions7d: app.contributedImpressions7d,
    graceDaysLeft: left,
    reciprocityThreshold: config.reciprocityImpressions,
    reciprocityGap: gap,
    keyPrefix: await keyPrefix(db, app.id),
  };
}

async function parseMultipart(c: Context<AppEnv>) {
  const body = await c.req.parseBody();
  const fields: Record<string, string> = {};
  let icon: { buf: Uint8Array; mime: string } | null = null;
  for (const [key, value] of Object.entries(body)) {
    if (value instanceof File) {
      icon = { buf: new Uint8Array(await value.arrayBuffer()), mime: value.type };
    } else if (typeof value === "string") {
      fields[key] = value;
    }
  }
  return { fields, icon };
}

async function resolveCategoryPair(
  c: Context<AppEnv>,
  parentRaw: string,
  childRaw: string,
): Promise<{ category: string; subcategory: string }> {
  if (!isValidCategoryName(parentRaw) || !isValidCategoryName(childRaw)) {
    throw new HttpError(400, ERROR_CODES.invalid_params, "请填写有效的大分类和小分类");
  }
  try {
    return await upsertCategoryPair(getDb(c.env.DB), parentRaw, childRaw);
  } catch {
    throw new HttpError(400, ERROR_CODES.invalid_params, "分类无效");
  }
}

export function dashboardAppRoutes(app: Hono<AppEnv>) {
  app.get("/dashboard/categories", requireUser, async (c) => {
    const tree = await listCategoryTree(getDb(c.env.DB));
    return c.json({
      items: tree.map((root) => ({
        id: root.id,
        name: root.name,
        children: root.children.map((child) => ({ id: child.id, name: child.name })),
      })),
    });
  });

  app.get("/dashboard/apps", requireUser, async (c) => {
    const user = mustUser(c);
    const db = getDb(c.env.DB);
    const list = await db
      .select()
      .from(apps)
      .where(eq(apps.developerId, user.id))
      .orderBy(desc(apps.createdAt));
    const config = await getConfig(db);
    const since = utcDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const listings = await platformsForApps(
      db,
      list.map((row) => row.id),
    );
    const items = await Promise.all(
      list.map(async (row) => {
        const rec = await db
          .select({
            total: sql<number>`cast(coalesce(sum(${appDailyStats.impressionsReceived}), 0) as integer)`,
          })
          .from(appDailyStats)
          .where(and(eq(appDailyStats.appId, row.id), sql`${appDailyStats.day} >= ${since}`));
        return {
          id: row.id,
          name: row.name,
          iconUrl: row.iconUrl,
          platforms: listings.get(row.id) ?? [],
          reviewStatus: row.reviewStatus,
          pausedByDeveloper: row.pausedByDeveloper,
          pausedByOps: row.pausedByOps,
          inRecommendPool: row.inRecommendPool,
          graceDaysLeft: graceDaysLeft(row.approvedAt, config.graceDays),
          impressionsReceived7d: Number(rec[0]?.total ?? 0),
        };
      }),
    );
    return c.json({ items });
  });

  app.post("/dashboard/apps", requireUser, async (c) => {
    const user = mustUser(c);
    const db = getDb(c.env.DB);
    const { fields, icon } = await parseMultipart(c);
    const name = fields.name?.trim();
    const tagline = fields.tagline?.trim();
    const description = fields.description?.trim() ?? "";
    const category = fields.category;
    const subcategory = fields.subcategory;
    if (!name || !tagline || !category || !subcategory) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请填写完整资料");
    }
    const pair = await resolveCategoryPair(c, category, subcategory);
    if (graphemeLength(tagline) > TAGLINE_MAX_GRAPHEMES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "简介不能超过 30 字");
    }
    if (graphemeLength(description) > DESCRIPTION_MAX_GRAPHEMES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "更多描述不能超过 200 字");
    }
    if (!icon) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请上传图标");
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(icon.mime)) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "图标需为 png/jpeg/webp");
    }
    if (icon.buf.byteLength > ICON_MAX_BYTES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "图标不能超过 512KB");
    }

    const [row] = await db
      .insert(apps)
      .values({
        developerId: user.id,
        name,
        iconUrl: "pending",
        tagline,
        description,
        category: pair.category,
        subcategory: pair.subcategory,
        listSize: LIST_SIZE_DEFAULT,
      })
      .returning();
    const key = generateApiKey();
    await db.insert(apiKeys).values({
      appId: row!.id,
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });

    const iconUrl = await uploadIcon(c.env.ICONS, row!.id, icon.buf, icon.mime);
    const [updated] = await db
      .update(apps)
      .set({ iconUrl, updatedAt: new Date() })
      .where(eq(apps.id, row!.id))
      .returning();

    return c.json({
      app: await present(c, updated!),
      apiKey: key.plaintext,
    });
  });

  app.get("/dashboard/apps/:id", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const row = await ownedApp(getDb(c.env.DB), user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    return c.json(await present(c, row));
  });

  app.patch("/dashboard/apps/:id", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.pausedByOps) {
      return sendError(c, 403, ERROR_CODES.forbidden, "运营已暂停，无法修改");
    }
    const parsed = patchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "参数无效");
    }
    if (parsed.data.tagline && graphemeLength(parsed.data.tagline) > TAGLINE_MAX_GRAPHEMES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "简介不能超过 30 字");
    }
    if (
      parsed.data.description !== undefined &&
      graphemeLength(parsed.data.description) > DESCRIPTION_MAX_GRAPHEMES
    ) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "更多描述不能超过 200 字");
    }
    let category = row.category;
    let subcategory = row.subcategory;
    if (parsed.data.category || parsed.data.subcategory) {
      const pair = await resolveCategoryPair(
        c,
        parsed.data.category ?? row.category,
        parsed.data.subcategory ?? row.subcategory,
      );
      category = pair.category;
      subcategory = pair.subcategory;
    }
    const [updated] = await db
      .update(apps)
      .set({
        name: parsed.data.name ?? row.name,
        tagline: parsed.data.tagline ?? row.tagline,
        description: parsed.data.description ?? row.description,
        category,
        subcategory,
        listSize: parsed.data.listSize ?? row.listSize,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id))
      .returning();
    return c.json(await present(c, updated!));
  });

  app.put("/dashboard/apps/:id/platforms", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.pausedByOps) {
      return sendError(c, 403, ERROR_CODES.forbidden, "运营已暂停，无法修改");
    }
    const body = await readJson(c);
    const parsed = parsePlatformsPayload(body);
    if (!parsed.ok) {
      return sendError(c, 400, ERROR_CODES.invalid_params, parsed.error);
    }
    const seen = new Set<string>();
    const normalized: {
      platform: (typeof PLATFORMS)[number];
      packageName: string;
      downloadStores: string[];
      extraDownloads: { label: string; url: string }[];
    }[] = [];
    for (const item of parsed.data.platforms) {
      if (seen.has(item.platform)) {
        return sendError(c, 400, ERROR_CODES.invalid_params, "同一端只能填一次");
      }
      seen.add(item.platform);
      const packageName = item.packageName.trim();
      if (!isValidPackageName(packageName)) {
        return sendError(c, 400, ERROR_CODES.invalid_params, "包名格式无效，需为反向域名如 com.company.app");
      }
      let downloadStores: string[] = [];
      let extraDownloads: { label: string; url: string }[] = [];
      if (item.platform === "android") {
        const stores = parseDownloadStores(item.downloadStores);
        if (!stores.ok) return sendError(c, 400, ERROR_CODES.invalid_params, stores.error);
        const extras = parseExtraDownloads(item.extraDownloads);
        if (!extras.ok) return sendError(c, 400, ERROR_CODES.invalid_params, extras.error);
        downloadStores = stores.value;
        extraDownloads = extras.value;
      }
      normalized.push({ platform: item.platform, packageName, downloadStores, extraDownloads });
    }
    try {
      await db.delete(appPlatforms).where(eq(appPlatforms.appId, id));
      if (normalized.length > 0) {
        await db.insert(appPlatforms).values(
          normalized.map((item) => ({
            appId: id,
            platform: item.platform,
            packageName: item.packageName,
            downloadStores: item.downloadStores,
            extraDownloads: item.extraDownloads,
          })),
        );
      }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return sendError(c, 409, ERROR_CODES.invalid_params, "该端包名已被其他应用占用");
      }
      throw err;
    }
    await invalidatePoolCache(c.env.KV);
    const fresh = await ownedApp(db, user.id, id);
    return c.json(await present(c, fresh!));
  });

  app.post("/dashboard/apps/:id/resubmit", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.reviewStatus !== "rejected") {
      return sendError(c, 400, ERROR_CODES.invalid_params, "仅被拒绝的应用可重提");
    }
    const [updated] = await db
      .update(apps)
      .set({
        reviewStatus: "pending",
        rejectedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id))
      .returning();
    return c.json(await present(c, updated!));
  });

  app.post("/dashboard/apps/:id/pause", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const [updated] = await db
      .update(apps)
      .set({ pausedByDeveloper: true, inRecommendPool: false, updatedAt: new Date() })
      .where(eq(apps.id, id))
      .returning();
    await invalidatePoolCache(c.env.KV);
    return c.json(await present(c, updated!));
  });

  app.post("/dashboard/apps/:id/resume", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.pausedByOps) {
      return sendError(c, 403, ERROR_CODES.forbidden, "运营已暂停，无法自行恢复");
    }
    await db.update(apps).set({ pausedByDeveloper: false, updatedAt: new Date() }).where(eq(apps.id, id));
    await syncAppPoolFlag(db, id);
    await invalidatePoolCache(c.env.KV);
    const fresh = await ownedApp(db, user.id, id);
    return c.json(await present(c, fresh!));
  });

  app.post("/dashboard/apps/:id/api-key/rotate", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const key = generateApiKey();
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.appId, id), sql`${apiKeys.revokedAt} is null`));
    await db.insert(apiKeys).values({
      appId: id,
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
    const fresh = await ownedApp(db, user.id, id);
    return c.json({ app: await present(c, fresh!), apiKey: key.plaintext });
  });

  app.post("/dashboard/apps/:id/icon", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const { icon } = await parseMultipart(c);
    if (!icon) return sendError(c, 400, ERROR_CODES.invalid_params, "请上传图标");
    if (!["image/png", "image/jpeg", "image/webp"].includes(icon.mime)) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "图标需为 png/jpeg/webp");
    }
    if (icon.buf.byteLength > ICON_MAX_BYTES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "图标不能超过 512KB");
    }
    const iconUrl = await uploadIcon(c.env.ICONS, id, icon.buf, icon.mime);
    const [updated] = await db
      .update(apps)
      .set({ iconUrl, updatedAt: new Date() })
      .where(eq(apps.id, id))
      .returning();
    return c.json(await present(c, updated!));
  });

  app.get("/dashboard/apps/:id/preview/recommend", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const q = z
      .object({
        platform: z.enum(PLATFORMS),
      })
      .safeParse(c.req.query());
    if (!q.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请指定 platform（android / ios / harmonyos）");
    }
    if (!(await hostHasPlatform(db, id, q.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    if (isSelfHidden(row)) {
      return c.json(hiddenRecommendResponse());
    }
    if (row.reviewStatus === "pending") {
      return c.json(visibleRecommendResponse(mockRecommend(q.data.platform, row.listSize), true));
    }
    const items = await recommendItems(db, c.env.KV, id, q.data.platform, row.listSize);
    return c.json(visibleRecommendResponse(items));
  });

  app.get("/dashboard/apps/:id/preview/apps", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const q = z
      .object({
        platform: z.enum(PLATFORMS),
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(LIST_MAX_PAGE_SIZE).default(LIST_DEFAULT_PAGE_SIZE),
      })
      .safeParse(c.req.query());
    if (!q.success) return sendError(c, 400, ERROR_CODES.invalid_params, "请指定 platform，分页参数无效");
    if (!(await hostHasPlatform(db, id, q.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    if (isSelfHidden(row)) {
      return c.json(hiddenListResponse(q.data.page, q.data.page_size));
    }
    if (row.reviewStatus === "pending") {
      return c.json(visibleListResponse(mockList(q.data.platform, q.data.page, q.data.page_size), true));
    }
    return c.json(visibleListResponse(await listItems(db, id, q.data.platform, q.data.page, q.data.page_size)));
  });

  app.get("/dashboard/apps/:id/stats", requireUser, async (c) => {
    const user = mustUser(c);
    const id = routeParam(c, "id");
    const range = c.req.query("range") === "30d" ? 30 : 7;
    const db = getDb(c.env.DB);
    const row = await ownedApp(db, user.id, id);
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const config = await getConfig(db);
    const since = utcDay(new Date(Date.now() - (range - 1) * 24 * 60 * 60 * 1000));
    const seriesRows = await db
      .select()
      .from(appDailyStats)
      .where(and(eq(appDailyStats.appId, id), gte(appDailyStats.day, since)))
      .orderBy(appDailyStats.day);

    const totals = seriesRows.reduce(
      (acc, d) => {
        acc.impressionsReceived += d.impressionsReceived;
        acc.clicksReceived += d.clicksReceived;
        acc.impressionsGiven += d.impressionsGiven;
        acc.clicksGiven += d.clicksGiven;
        return acc;
      },
      { impressionsReceived: 0, clicksReceived: 0, impressionsGiven: 0, clicksGiven: 0 },
    );

    const series: {
      day: string;
      impressionsReceived: number;
      clicksReceived: number;
      impressionsGiven: number;
      clicksGiven: number;
    }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const day = utcDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
      const hit = seriesRows.find((s) => String(s.day) === day);
      series.push({
        day,
        impressionsReceived: hit?.impressionsReceived ?? 0,
        clicksReceived: hit?.clicksReceived ?? 0,
        impressionsGiven: hit?.impressionsGiven ?? 0,
        clicksGiven: hit?.clicksGiven ?? 0,
      });
    }

    return c.json({
      range: range === 30 ? "30d" : "7d",
      impressionsReceived: totals.impressionsReceived,
      clicksReceived: totals.clicksReceived,
      ctrReceived:
        totals.impressionsReceived === 0 ? null : totals.clicksReceived / totals.impressionsReceived,
      impressionsGiven: totals.impressionsGiven,
      clicksGiven: totals.clicksGiven,
      inRecommendPool: row.inRecommendPool,
      graceDaysLeft: graceDaysLeft(row.approvedAt, config.graceDays),
      reciprocityThreshold: config.reciprocityImpressions,
      contributedImpressions7d: row.contributedImpressions7d,
      reciprocityGap: Math.max(0, config.reciprocityImpressions - row.contributedImpressions7d),
      series,
    });
  });
}
