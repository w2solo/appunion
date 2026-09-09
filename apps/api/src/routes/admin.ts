import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  anomalyFlags,
  appReviews,
  apps,
  developers,
  categoryUsage,
  createCategory,
  deleteCategory,
  getConfig,
  listCategoryTree,
  platformConfig,
  platformsForApps,
  refreshRecommendPool,
  renameCategory,
  syncAppPoolFlag,
} from "@appunions/db";
import {
  ERROR_CODES,
  graphemeLength,
  ICON_MAX_BYTES,
  isSuperAdminEmail,
  isValidCategoryName,
  UNION_DESCRIPTION_MAX_GRAPHEMES,
  UNION_LOGO_ID,
  UNION_NAME_MAX_GRAPHEMES,
  UNION_SUBTITLE_MAX_GRAPHEMES,
} from "@appunions/shared";
import { getDb } from "../db.js";
import { readJson, routeParam, type AppEnv } from "../context.js";
import { sendError } from "../errors.js";
import { mustUser, publicUser, requireAdmin, requireSuperAdmin } from "../lib/session.js";
import { invalidatePoolCache } from "../kv.js";
import { uploadIcon } from "../icons.js";

const configPatch = z.object({
  graceDays: z.number().int().min(1).max(90).optional(),
  reciprocityImpressions: z.number().int().min(0).max(1_000_000).optional(),
  impressionDedupMinutes: z.number().int().min(1).max(24 * 60).optional(),
  recommendCacheSeconds: z.number().int().min(1).max(600).optional(),
  rateRecommendPerMin: z.number().int().min(1).max(10_000).optional(),
  rateListPerMin: z.number().int().min(1).max(10_000).optional(),
  rateInfoPerMin: z.number().int().min(1).max(10_000).optional(),
  rateImpressionsPerMin: z.number().int().min(1).max(10_000).optional(),
  rateClicksPerMin: z.number().int().min(1).max(10_000).optional(),
  unionName: z.string().min(1).optional(),
  unionSubtitle: z.string().min(1).optional(),
  unionDescription: z.string().min(1).optional(),
});

function withOpsMeta<T extends object>(c: { env: { SUPER_ADMIN_EMAIL: string } }, row: T) {
  return { ...row, superAdminEmail: c.env.SUPER_ADMIN_EMAIL };
}

export function adminRoutes(app: Hono<AppEnv>) {
  app.use("/admin/*", requireAdmin);

  app.get("/admin/apps", async (c) => {
    const db = getDb(c.env.DB);
    const status = c.req.query("status");
    const rows = await db
      .select({
        app: apps,
        email: developers.email,
      })
      .from(apps)
      .innerJoin(developers, eq(developers.id, apps.developerId))
      .orderBy(desc(apps.createdAt));
    const filtered = status
      ? status === "ops_paused"
        ? rows.filter((r) => r.app.pausedByOps)
        : rows.filter((r) => r.app.reviewStatus === status)
      : rows;
    const listings = await platformsForApps(
      db,
      filtered.map((r) => r.app.id),
    );
    return c.json({
      items: filtered.map((r) => ({
        ...r.app,
        platforms: listings.get(r.app.id) ?? [],
        developerEmail: r.email,
      })),
    });
  });

  app.get("/admin/apps/:id", async (c) => {
    const db = getDb(c.env.DB);
    const id = routeParam(c, "id");
    const rows = await db
      .select({ app: apps, email: developers.email })
      .from(apps)
      .innerJoin(developers, eq(developers.id, apps.developerId))
      .where(eq(apps.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const reviews = await db
      .select()
      .from(appReviews)
      .where(eq(appReviews.appId, id))
      .orderBy(desc(appReviews.createdAt));
    const listings = await platformsForApps(db, [id]);
    return c.json({
      ...row.app,
      platforms: listings.get(id) ?? [],
      developerEmail: row.email,
      reviews,
    });
  });

  app.post("/admin/apps/:id/approve", async (c) => {
    const actor = mustUser(c);
    const db = getDb(c.env.DB);
    const id = routeParam(c, "id");
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    const approvedAt = appRow.approvedAt ?? new Date();
    await db
      .update(apps)
      .set({
        reviewStatus: "approved",
        rejectedReason: null,
        approvedAt,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id));
    await db.insert(appReviews).values({
      appId: id,
      actorId: actor.id,
      action: "approve",
    });
    await syncAppPoolFlag(db, id);
    await invalidatePoolCache(c.env.KV);
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return c.json(fresh[0]);
  });

  app.post("/admin/apps/:id/reject", async (c) => {
    const actor = mustUser(c);
    const db = getDb(c.env.DB);
    const id = routeParam(c, "id");
    const reason = z.object({ reason: z.string().min(1) }).safeParse(await readJson(c));
    if (!reason.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "拒绝必须填写原因");
    }
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    await db
      .update(apps)
      .set({
        reviewStatus: "rejected",
        rejectedReason: reason.data.reason,
        inRecommendPool: false,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id));
    await db.insert(appReviews).values({
      appId: id,
      actorId: actor.id,
      action: "reject",
      reason: reason.data.reason,
    });
    await invalidatePoolCache(c.env.KV);
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return c.json(fresh[0]);
  });

  app.post("/admin/apps/:id/pause", async (c) => {
    const actor = mustUser(c);
    const db = getDb(c.env.DB);
    const id = routeParam(c, "id");
    const reason = z.object({ reason: z.string().min(1) }).safeParse(await readJson(c));
    if (!reason.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "暂停必须填写原因");
    }
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    await db
      .update(apps)
      .set({
        pausedByOps: true,
        inRecommendPool: false,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id));
    await db.insert(appReviews).values({
      appId: id,
      actorId: actor.id,
      action: "ops_pause",
      reason: reason.data.reason,
    });
    await invalidatePoolCache(c.env.KV);
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return c.json(fresh[0]);
  });

  app.post("/admin/apps/:id/resume", async (c) => {
    const actor = mustUser(c);
    const db = getDb(c.env.DB);
    const id = routeParam(c, "id");
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(c, 404, ERROR_CODES.not_found, "应用不存在");
    await db.update(apps).set({ pausedByOps: false, updatedAt: new Date() }).where(eq(apps.id, id));
    await db.insert(appReviews).values({
      appId: id,
      actorId: actor.id,
      action: "ops_resume",
    });
    await syncAppPoolFlag(db, id);
    await invalidatePoolCache(c.env.KV);
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return c.json(fresh[0]);
  });

  app.get("/admin/anomalies", async (c) => {
    const db = getDb(c.env.DB);
    const rows = await db
      .select({ flag: anomalyFlags, app: apps })
      .from(anomalyFlags)
      .innerJoin(apps, eq(apps.id, anomalyFlags.appId))
      .orderBy(desc(anomalyFlags.createdAt));
    return c.json({
      items: rows.map((r) => ({
        ...r.flag,
        appName: r.app.name,
      })),
    });
  });

  app.get("/admin/config", async (c) => c.json(withOpsMeta(c, await getConfig(getDb(c.env.DB)))));

  app.patch("/admin/config", async (c) => {
    const db = getDb(c.env.DB);
    const parsed = configPatch.safeParse(await readJson(c));
    if (!parsed.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "参数无效");
    }
    const unionName = parsed.data.unionName?.trim();
    const unionSubtitle = parsed.data.unionSubtitle?.trim();
    const unionDescription = parsed.data.unionDescription?.trim();
    if (unionName !== undefined && graphemeLength(unionName) > UNION_NAME_MAX_GRAPHEMES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, `对外名称不能超过 ${UNION_NAME_MAX_GRAPHEMES} 字`);
    }
    if (unionSubtitle !== undefined && graphemeLength(unionSubtitle) > UNION_SUBTITLE_MAX_GRAPHEMES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, `宣传语不能超过 ${UNION_SUBTITLE_MAX_GRAPHEMES} 字`);
    }
    if (unionDescription !== undefined && graphemeLength(unionDescription) > UNION_DESCRIPTION_MAX_GRAPHEMES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, `解释说明不能超过 ${UNION_DESCRIPTION_MAX_GRAPHEMES} 字`);
    }
    const current = await getConfig(db);
    const [updated] = await db
      .update(platformConfig)
      .set({
        graceDays: parsed.data.graceDays ?? current.graceDays,
        reciprocityImpressions: parsed.data.reciprocityImpressions ?? current.reciprocityImpressions,
        impressionDedupMinutes:
          parsed.data.impressionDedupMinutes ?? current.impressionDedupMinutes,
        recommendCacheSeconds: parsed.data.recommendCacheSeconds ?? current.recommendCacheSeconds,
        rateRecommendPerMin: parsed.data.rateRecommendPerMin ?? current.rateRecommendPerMin,
        rateListPerMin: parsed.data.rateListPerMin ?? current.rateListPerMin,
        rateInfoPerMin: parsed.data.rateInfoPerMin ?? current.rateInfoPerMin,
        rateImpressionsPerMin: parsed.data.rateImpressionsPerMin ?? current.rateImpressionsPerMin,
        rateClicksPerMin: parsed.data.rateClicksPerMin ?? current.rateClicksPerMin,
        unionName: unionName || current.unionName,
        unionSubtitle: unionSubtitle || current.unionSubtitle,
        unionDescription: unionDescription || current.unionDescription,
      })
      .where(eq(platformConfig.id, 1))
      .returning();
    const shouldRefreshPool =
      (parsed.data.graceDays !== undefined && parsed.data.graceDays !== current.graceDays) ||
      (parsed.data.reciprocityImpressions !== undefined &&
        parsed.data.reciprocityImpressions !== current.reciprocityImpressions);
    if (shouldRefreshPool) {
      await refreshRecommendPool(db);
      await invalidatePoolCache(c.env.KV);
    }
    return c.json(withOpsMeta(c, updated!));
  });

  app.post("/admin/config/logo", async (c) => {
    const db = getDb(c.env.DB);
    const body = await c.req.parseBody();
    let icon: { buf: Uint8Array; mime: string } | null = null;
    for (const value of Object.values(body)) {
      if (value instanceof File) {
        icon = { buf: new Uint8Array(await value.arrayBuffer()), mime: value.type };
        break;
      }
    }
    if (!icon) return sendError(c, 400, ERROR_CODES.invalid_params, "请上传图标");
    if (!["image/png", "image/jpeg", "image/webp"].includes(icon.mime)) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "图标需为 png/jpeg/webp");
    }
    if (icon.buf.byteLength > ICON_MAX_BYTES) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "图标不能超过 512KB");
    }
    const unionLogoUrl = await uploadIcon(c.env.ICONS, UNION_LOGO_ID, icon.buf, icon.mime);
    const [updated] = await db
      .update(platformConfig)
      .set({ unionLogoUrl })
      .where(eq(platformConfig.id, 1))
      .returning();
    return c.json(withOpsMeta(c, updated!));
  });

  app.get("/admin/categories", async (c) => {
    const db = getDb(c.env.DB);
    const tree = await listCategoryTree(db);
    return c.json({ items: await categoryUsage(db, tree) });
  });

  app.post("/admin/categories", async (c) => {
    const parsed = z
      .object({ name: z.string(), parentId: z.string().uuid().nullable().optional() })
      .safeParse(await readJson(c));
    if (!parsed.success || !isValidCategoryName(parsed.data.name)) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请填写有效的分类名");
    }
    try {
      const row = await createCategory(getDb(c.env.DB), parsed.data.name, parsed.data.parentId ?? null);
      return c.json(row);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "duplicate_category") {
        return sendError(c, 400, ERROR_CODES.invalid_params, "同级已有这个分类");
      }
      if (code === "invalid_parent") {
        return sendError(c, 400, ERROR_CODES.invalid_params, "只能挂在大分类下");
      }
      return sendError(c, 400, ERROR_CODES.invalid_params, "分类无效");
    }
  });

  app.patch("/admin/categories/:id", async (c) => {
    const id = routeParam(c, "id");
    const parsed = z.object({ name: z.string() }).safeParse(await readJson(c));
    if (!parsed.success || !isValidCategoryName(parsed.data.name)) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请填写有效的分类名");
    }
    try {
      const row = await renameCategory(getDb(c.env.DB), id, parsed.data.name);
      if (!row) return sendError(c, 404, ERROR_CODES.not_found, "分类不存在");
      return c.json(row);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "duplicate_category") {
        return sendError(c, 400, ERROR_CODES.invalid_params, "同级已有这个分类");
      }
      return sendError(c, 400, ERROR_CODES.invalid_params, "分类无效");
    }
  });

  app.delete("/admin/categories/:id", async (c) => {
    const id = routeParam(c, "id");
    const result = await deleteCategory(getDb(c.env.DB), id);
    if (result === "missing") return sendError(c, 404, ERROR_CODES.not_found, "分类不存在");
    if (result === "has_children") {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请先删掉小分类");
    }
    if (result === "in_use") {
      return sendError(c, 400, ERROR_CODES.invalid_params, "已有应用在用，不能删除");
    }
    return c.json({ ok: true });
  });

  app.get("/admin/users", requireSuperAdmin, async (c) => {
    const db = getDb(c.env.DB);
    const raw = String(c.req.query("q") ?? "")
      .trim()
      .slice(0, 100);
    const q = raw.replace(/[%_\\]/g, "");
    const columns = {
      id: developers.id,
      email: developers.email,
      role: developers.role,
    };
    const rows = q
      ? await db
          .select(columns)
          .from(developers)
          .where(sql`lower(${developers.email}) like ${`%${q.toLowerCase()}%`}`)
          .orderBy(desc(developers.createdAt))
          .limit(50)
      : await db
          .select(columns)
          .from(developers)
          .orderBy(sql`case when ${developers.role} = 'admin' then 0 else 1 end`, desc(developers.createdAt))
          .limit(50);
    return c.json({ items: rows.map((row) => publicUser(row, c.env.SUPER_ADMIN_EMAIL)) });
  });

  app.patch("/admin/users/:id", requireSuperAdmin, async (c) => {
    const db = getDb(c.env.DB);
    const id = routeParam(c, "id");
    const parsed = z.object({ role: z.enum(["admin", "developer"]) }).safeParse(await readJson(c));
    if (!parsed.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "参数无效");
    }
    const rows = await db.select().from(developers).where(eq(developers.id, id)).limit(1);
    const target = rows[0];
    if (!target) return sendError(c, 404, ERROR_CODES.not_found, "用户不存在");
    if (isSuperAdminEmail(target.email, c.env.SUPER_ADMIN_EMAIL)) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "不能更改超级管理员");
    }
    const [updated] = await db
      .update(developers)
      .set({ role: parsed.data.role })
      .where(eq(developers.id, id))
      .returning();
    return c.json(publicUser(updated!, c.env.SUPER_ADMIN_EMAIL));
  });
}
