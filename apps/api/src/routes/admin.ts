import type { FastifyInstance } from "fastify";
import { desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import {
  anomalyFlags,
  appReviews,
  apps,
  developers,
  getConfig,
  platformConfig,
  platformsForApps,
  refreshRecommendPool,
  syncAppPoolFlag,
} from "@appunions/db";
import { ERROR_CODES, isSuperAdminEmail } from "@appunions/shared";
import { db } from "../db.js";
import { sendError } from "../errors.js";
import { mustUser, publicUser, requireAdmin, requireSuperAdmin } from "../lib/session.js";
import { invalidatePoolCache } from "../lib/redis-ops.js";

const configPatch = z.object({
  graceDays: z.number().int().min(1).max(90).optional(),
  reciprocityImpressions: z.number().int().min(0).max(1_000_000).optional(),
  impressionDedupMinutes: z.number().int().min(1).max(24 * 60).optional(),
  recommendCacheSeconds: z.number().int().min(1).max(600).optional(),
  rateRecommendPerMin: z.number().int().min(1).max(10_000).optional(),
  rateListPerMin: z.number().int().min(1).max(10_000).optional(),
  rateImpressionsPerMin: z.number().int().min(1).max(10_000).optional(),
  rateClicksPerMin: z.number().int().min(1).max(10_000).optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/admin")) return;
    await requireAdmin()(request, reply);
  });

  app.get("/admin/apps", async (request) => {
    const status = (request.query as { status?: string }).status;
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
    return {
      items: filtered.map((r) => ({
        ...r.app,
        platforms: listings.get(r.app.id) ?? [],
        developerEmail: r.email,
      })),
    };
  });

  app.get("/admin/apps/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select({ app: apps, email: developers.email })
      .from(apps)
      .innerJoin(developers, eq(developers.id, apps.developerId))
      .where(eq(apps.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const reviews = await db
      .select()
      .from(appReviews)
      .where(eq(appReviews.appId, id))
      .orderBy(desc(appReviews.createdAt));
    const listings = await platformsForApps(db, [id]);
    return {
      ...row.app,
      platforms: listings.get(id) ?? [],
      developerEmail: row.email,
      reviews,
    };
  });

  app.post("/admin/apps/:id/approve", async (request, reply) => {
    const actor = mustUser(request);
    const { id } = request.params as { id: string };
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    const approvedAt = appRow.approvedAt ?? new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(apps)
        .set({
          reviewStatus: "approved",
          rejectedReason: null,
          approvedAt,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, id));
      await tx.insert(appReviews).values({
        appId: id,
        actorId: actor.id,
        action: "approve",
      });
    });
    await syncAppPoolFlag(db, id);
    await invalidatePoolCache();
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return fresh[0];
  });

  app.post("/admin/apps/:id/reject", async (request, reply) => {
    const actor = mustUser(request);
    const { id } = request.params as { id: string };
    const reason = z.object({ reason: z.string().min(1) }).safeParse(request.body);
    if (!reason.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "拒绝必须填写原因");
    }
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    await db.transaction(async (tx) => {
      await tx
        .update(apps)
        .set({
          reviewStatus: "rejected",
          rejectedReason: reason.data.reason,
          inRecommendPool: false,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, id));
      await tx.insert(appReviews).values({
        appId: id,
        actorId: actor.id,
        action: "reject",
        reason: reason.data.reason,
      });
    });
    await invalidatePoolCache();
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return fresh[0];
  });

  app.post("/admin/apps/:id/pause", async (request, reply) => {
    const actor = mustUser(request);
    const { id } = request.params as { id: string };
    const reason = z.object({ reason: z.string().min(1) }).safeParse(request.body);
    if (!reason.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "暂停必须填写原因");
    }
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    await db.transaction(async (tx) => {
      await tx
        .update(apps)
        .set({
          pausedByOps: true,
          inRecommendPool: false,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, id));
      await tx.insert(appReviews).values({
        appId: id,
        actorId: actor.id,
        action: "ops_pause",
        reason: reason.data.reason,
      });
    });
    await invalidatePoolCache();
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return fresh[0];
  });

  app.post("/admin/apps/:id/resume", async (request, reply) => {
    const actor = mustUser(request);
    const { id } = request.params as { id: string };
    const rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    const appRow = rows[0];
    if (!appRow) return sendError(reply, 404, ERROR_CODES.not_found, "应用不存在");
    await db.transaction(async (tx) => {
      await tx.update(apps).set({ pausedByOps: false, updatedAt: new Date() }).where(eq(apps.id, id));
      await tx.insert(appReviews).values({
        appId: id,
        actorId: actor.id,
        action: "ops_resume",
      });
    });
    await syncAppPoolFlag(db, id);
    await invalidatePoolCache();
    const fresh = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return fresh[0];
  });

  app.get("/admin/anomalies", async () => {
    const rows = await db
      .select({ flag: anomalyFlags, app: apps })
      .from(anomalyFlags)
      .innerJoin(apps, eq(apps.id, anomalyFlags.appId))
      .orderBy(desc(anomalyFlags.createdAt));
    return {
      items: rows.map((r) => ({
        ...r.flag,
        appName: r.app.name,
      })),
    };
  });

  app.get("/admin/config", async () => getConfig(db));

  app.patch("/admin/config", async (request, reply) => {
    const parsed = configPatch.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "参数无效");
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
        rateImpressionsPerMin: parsed.data.rateImpressionsPerMin ?? current.rateImpressionsPerMin,
        rateClicksPerMin: parsed.data.rateClicksPerMin ?? current.rateClicksPerMin,
      })
      .where(eq(platformConfig.id, 1))
      .returning();
    await refreshRecommendPool(db);
    await invalidatePoolCache();
    return updated;
  });

  app.get("/admin/users", { preHandler: requireSuperAdmin() }, async (request) => {
    const raw = String((request.query as { q?: string }).q ?? "")
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
          .where(ilike(developers.email, `%${q}%`))
          .orderBy(desc(developers.createdAt))
          .limit(50)
      : await db
          .select(columns)
          .from(developers)
          .orderBy(sql`case when ${developers.role} = 'admin' then 0 else 1 end`, desc(developers.createdAt))
          .limit(50);
    return { items: rows.map(publicUser) };
  });

  app.patch("/admin/users/:id", { preHandler: requireSuperAdmin() }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ role: z.enum(["admin", "developer"]) }).safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "参数无效");
    }
    const rows = await db.select().from(developers).where(eq(developers.id, id)).limit(1);
    const target = rows[0];
    if (!target) return sendError(reply, 404, ERROR_CODES.not_found, "用户不存在");
    if (isSuperAdminEmail(target.email)) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "不能更改超级管理员");
    }
    const [updated] = await db
      .update(developers)
      .set({ role: parsed.data.role })
      .where(eq(developers.id, id))
      .returning();
    return publicUser(updated!);
  });
}
