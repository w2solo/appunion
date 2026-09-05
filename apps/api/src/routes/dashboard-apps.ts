import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  apiKeys,
  appDailyStats,
  appPlatforms,
  apps,
  getConfig,
  graceDaysLeft,
  listCategoryTree,
  platformsForApps,
  syncAppPoolFlag,
  upsertCategoryPair,
} from "@appunions/db";
import {
  ERROR_CODES,
  ICON_MAX_BYTES,
  LIST_DEFAULT_PAGE_SIZE,
  LIST_MAX_PAGE_SIZE,
  LIST_SIZE_MAX,
  LIST_SIZE_MIN,
  PLATFORMS,
  TAGLINE_MAX_GRAPHEMES,
  graphemeLength,
  isValidCategoryName,
  isValidPackageName,
} from "@appunions/shared";
import { db } from "../db.js";
import { sendError } from "../errors.js";
import { generateApiKey } from "../lib/api-keys.js";
import { hostHasPlatform, listItems, recommendItems } from "../lib/catalog.js";
import { mustUser, requireUser } from "../lib/session.js";
import { invalidatePoolCache } from "../lib/redis-ops.js";
import { uploadIcon } from "../s3.js";
import { utcDay } from "../lib/stats.js";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  tagline: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  subcategory: z.string().min(1).optional(),
  listSize: z.number().int().min(LIST_SIZE_MIN).max(LIST_SIZE_MAX).optional(),
});

const platformsSchema = z.object({
  platforms: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        packageName: z.string().min(1),
      }),
    )
    .max(PLATFORMS.length),
});

function publicFields(app: typeof apps.$inferSelect) {
  return {
    id: app.id,
    name: app.name,
    iconUrl: app.iconUrl,
    tagline: app.tagline,
    category: app.category,
    subcategory: app.subcategory,
    listSize: app.listSize,
  };
}

function isUniqueViolation(err: unknown) {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if ("code" in current && (current as { code: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

async function ownedApp(developerId: string, appId: string) {
  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.developerId, developerId)))
    .limit(1);
  return rows[0] ?? null;
}

async function keyPrefix(appId: string) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.appId, appId), sql`${apiKeys.revokedAt} is null`))
    .limit(1);
  return rows[0]?.keyPrefix ?? "";
}

async function present(app: typeof apps.$inferSelect) {
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
    keyPrefix: await keyPrefix(app.id),
  };
}

async function parseMultipart(request: Parameters<FastifyInstance["post"]>[1] extends infer _ ? any : never) {
  const fields: Record<string, string> = {};
  let icon: { buf: Buffer; mime: string } | null = null;
  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      const buf = await part.toBuffer();
      icon = { buf, mime: part.mimetype };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, icon };
}

async function resolveCategoryPair(
  parentRaw: string,
  childRaw: string,
  reply: FastifyReply,
): Promise<{ category: string; subcategory: string } | undefined> {
  if (!isValidCategoryName(parentRaw) || !isValidCategoryName(childRaw)) {
    sendError(reply, 400, ERROR_CODES.invalid_params, "请填写有效的大分类和小分类");
    return;
  }
  try {
    return await upsertCategoryPair(db, parentRaw, childRaw);
  } catch {
    sendError(reply, 400, ERROR_CODES.invalid_params, "分类无效");
    return;
  }
}

export async function dashboardAppRoutes(app: FastifyInstance) {
  app.get("/dashboard/categories", { preHandler: requireUser() }, async () => {
    const tree = await listCategoryTree(db);
    return {
      items: tree.map((root) => ({
        id: root.id,
        name: root.name,
        children: root.children.map((child) => ({ id: child.id, name: child.name })),
      })),
    };
  });
  app.get("/dashboard/apps", { preHandler: requireUser() }, async (request) => {
    const user = mustUser(request);
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
            total: sql<number>`coalesce(sum(${appDailyStats.impressionsReceived}), 0)::int`,
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
          impressionsReceived7d: rec[0]?.total ?? 0,
        };
      }),
    );
    return { items };
  });

  app.post("/dashboard/apps", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { fields, icon } = await parseMultipart(request);
    const name = fields.name?.trim();
    const tagline = fields.tagline?.trim();
    const category = fields.category;
    const subcategory = fields.subcategory;
    if (!name || !tagline || !category || !subcategory) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "请填写完整资料");
    }
    const pair = await resolveCategoryPair(category, subcategory, reply);
    if (!pair) return;
    if (graphemeLength(tagline) > TAGLINE_MAX_GRAPHEMES) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "描述不能超过 30 字");
    }
    if (!icon) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "请上传图标");
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(icon.mime)) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "图标需为 png/jpeg/webp");
    }
    if (icon.buf.length > ICON_MAX_BYTES) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "图标不能超过 512KB");
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(apps)
        .values({
          developerId: user.id,
          name,
          iconUrl: "pending",
          tagline,
          category: pair.category,
          subcategory: pair.subcategory,
        })
        .returning();
      const key = generateApiKey();
      await tx.insert(apiKeys).values({
        appId: row!.id,
        keyPrefix: key.prefix,
        keyHash: key.hash,
      });
      return { row: row!, apiKey: key.plaintext };
    });

    const iconUrl = await uploadIcon(created.row.id, icon.buf, icon.mime);
    const [updated] = await db
      .update(apps)
      .set({ iconUrl, updatedAt: new Date() })
      .where(eq(apps.id, created.row.id))
      .returning();

    return {
      app: await present(updated!),
      apiKey: created.apiKey,
    };
  });

  app.get("/dashboard/apps/:id", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    return present(row);
  });

  app.patch("/dashboard/apps/:id", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.pausedByOps) {
      return sendError(reply, 403, ERROR_CODES.forbidden, "运营已暂停，无法修改");
    }
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "参数无效");
    }
    if (parsed.data.tagline && graphemeLength(parsed.data.tagline) > TAGLINE_MAX_GRAPHEMES) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "描述不能超过 30 字");
    }
    let category = row.category;
    let subcategory = row.subcategory;
    if (parsed.data.category || parsed.data.subcategory) {
      const pair = await resolveCategoryPair(
        parsed.data.category ?? row.category,
        parsed.data.subcategory ?? row.subcategory,
        reply,
      );
      if (!pair) return;
      category = pair.category;
      subcategory = pair.subcategory;
    }
    const [updated] = await db
      .update(apps)
      .set({
        name: parsed.data.name ?? row.name,
        tagline: parsed.data.tagline ?? row.tagline,
        category,
        subcategory,
        listSize: parsed.data.listSize ?? row.listSize,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id))
      .returning();
    return present(updated!);
  });

  app.put("/dashboard/apps/:id/platforms", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.pausedByOps) {
      return sendError(reply, 403, ERROR_CODES.forbidden, "运营已暂停，无法修改");
    }
    const parsed = platformsSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "平台参数无效");
    }
    const seen = new Set<string>();
    for (const item of parsed.data.platforms) {
      if (seen.has(item.platform)) {
        return sendError(reply, 400, ERROR_CODES.invalid_params, "同一端只能填一次");
      }
      seen.add(item.platform);
      const packageName = item.packageName.trim();
      if (!isValidPackageName(packageName)) {
        return sendError(reply, 400, ERROR_CODES.invalid_params, "包名格式无效，需为反向域名如 com.company.app");
      }
    }
    try {
      await db.transaction(async (tx) => {
        await tx.delete(appPlatforms).where(eq(appPlatforms.appId, id));
        if (parsed.data.platforms.length > 0) {
          await tx.insert(appPlatforms).values(
            parsed.data.platforms.map((item) => ({
              appId: id,
              platform: item.platform,
              packageName: item.packageName.trim(),
            })),
          );
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return sendError(reply, 409, ERROR_CODES.invalid_params, "该端包名已被其他应用占用");
      }
      throw err;
    }
    await invalidatePoolCache();
    const fresh = await ownedApp(user.id, id);
    return present(fresh!);
  });

  app.post("/dashboard/apps/:id/resubmit", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.reviewStatus !== "rejected") {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "仅被拒绝的应用可重提");
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
    return present(updated!);
  });

  app.post("/dashboard/apps/:id/pause", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const [updated] = await db
      .update(apps)
      .set({ pausedByDeveloper: true, inRecommendPool: false, updatedAt: new Date() })
      .where(eq(apps.id, id))
      .returning();
    await invalidatePoolCache();
    return present(updated!);
  });

  app.post("/dashboard/apps/:id/resume", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    if (row.pausedByOps) {
      return sendError(reply, 403, ERROR_CODES.forbidden, "运营已暂停，无法自行恢复");
    }
    await db.update(apps).set({ pausedByDeveloper: false, updatedAt: new Date() }).where(eq(apps.id, id));
    await syncAppPoolFlag(db, id);
    await invalidatePoolCache();
    const fresh = await ownedApp(user.id, id);
    return present(fresh!);
  });

  app.post("/dashboard/apps/:id/api-key/rotate", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const key = generateApiKey();
    await db.transaction(async (tx) => {
      await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.appId, id), sql`${apiKeys.revokedAt} is null`));
      await tx.insert(apiKeys).values({
        appId: id,
        keyPrefix: key.prefix,
        keyHash: key.hash,
      });
    });
    const fresh = await ownedApp(user.id, id);
    return { app: await present(fresh!), apiKey: key.plaintext };
  });

  app.post("/dashboard/apps/:id/icon", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const { icon } = await parseMultipart(request);
    if (!icon) return sendError(reply, 400, ERROR_CODES.invalid_params, "请上传图标");
    if (!["image/png", "image/jpeg", "image/webp"].includes(icon.mime)) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "图标需为 png/jpeg/webp");
    }
    if (icon.buf.length > ICON_MAX_BYTES) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "图标不能超过 512KB");
    }
    const iconUrl = await uploadIcon(id, icon.buf, icon.mime);
    const [updated] = await db
      .update(apps)
      .set({ iconUrl, updatedAt: new Date() })
      .where(eq(apps.id, id))
      .returning();
    return present(updated!);
  });

  app.get("/dashboard/apps/:id/preview/recommend", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const q = z
      .object({
        platform: z.enum(PLATFORMS),
      })
      .safeParse(request.query);
    if (!q.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "请指定 platform（android / ios / harmonyos）");
    }
    if (!(await hostHasPlatform(id, q.data.platform))) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    const items = await recommendItems(id, q.data.platform, row.listSize);
    return { items };
  });

  app.get("/dashboard/apps/:id/preview/apps", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const q = z
      .object({
        platform: z.enum(PLATFORMS),
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(LIST_MAX_PAGE_SIZE).default(LIST_DEFAULT_PAGE_SIZE),
      })
      .safeParse(request.query);
    if (!q.success) return sendError(reply, 400, ERROR_CODES.invalid_params, "请指定 platform，分页参数无效");
    if (!(await hostHasPlatform(id, q.data.platform))) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    return listItems(id, q.data.platform, q.data.page, q.data.page_size);
  });

  app.get("/dashboard/apps/:id/stats", { preHandler: requireUser() }, async (request, reply) => {
    const user = mustUser(request);
    const { id } = request.params as { id: string };
    const range = (request.query as { range?: string }).range === "30d" ? 30 : 7;
    const row = await ownedApp(user.id, id);
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
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

    return {
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
    };
  });
}
