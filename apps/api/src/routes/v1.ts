import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import {
  appPlatforms,
  apps,
  clickEvents,
  getConfig,
  impressionEvents,
  isCatalogVisible,
} from "@appunions/db";
import {
  ERROR_CODES,
  IMPRESSION_BATCH_MAX,
  LIST_DEFAULT_PAGE_SIZE,
  LIST_MAX_PAGE_SIZE,
  PLATFORMS,
  RECOMMEND_MAX,
  type Platform,
} from "@appunions/shared";
import { getDb } from "../db.js";
import { readJson, type AppEnv } from "../context.js";
import type { Env } from "../env.js";
import { sendError } from "../errors.js";
import {
  appDetail,
  hiddenDetailResponse,
  hiddenListResponse,
  hiddenRecommendResponse,
  hostHasPlatform,
  isSelfHidden,
  listItems,
  recommendItems,
  unionInfoResponse,
  visibleDetailResponse,
  visibleListResponse,
  visibleRecommendResponse,
} from "../lib/catalog.js";
import { isMockAppId, mockDetail, mockList, mockRecommend } from "../lib/mock-catalog.js";
import { impressionDedupSet, rateLimit, recentUnion, rememberRecent } from "../kv.js";
import { bumpStats } from "../lib/stats.js";

type Host = typeof apps.$inferSelect;
type HostError = {
  error: true;
  status: 401 | 403;
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
  message: string;
};

async function hostFromAppId(c: { env: Env; req: { query: (name: string) => string | undefined } }): Promise<
  Host | HostError
> {
  const parsed = z.string().uuid().safeParse(c.req.query("app_id"));
  if (!parsed.success) {
    return { error: true, status: 401, code: ERROR_CODES.unauthorized, message: "Invalid app_id" };
  }
  const db = getDb(c.env.DB);
  const appRows = await db.select().from(apps).where(eq(apps.id, parsed.data)).limit(1);
  const host = appRows[0];
  if (!host) {
    return { error: true, status: 401, code: ERROR_CODES.unauthorized, message: "Invalid app_id" };
  }
  if (host.reviewStatus === "rejected") {
    return {
      error: true,
      status: 403,
      code: ERROR_CODES.app_not_approved,
      message: "App is not approved",
    };
  }
  if (host.pausedByOps) {
    return {
      error: true,
      status: 403,
      code: ERROR_CODES.app_paused_by_ops,
      message: "App is paused by ops",
    };
  }
  return host;
}

function isHost(v: Awaited<ReturnType<typeof hostFromAppId>>): v is Host {
  return !("error" in v);
}

async function listingFor(db: ReturnType<typeof getDb>, appId: string, platform: Platform) {
  const rows = await db
    .select()
    .from(appPlatforms)
    .where(and(eq(appPlatforms.appId, appId), eq(appPlatforms.platform, platform)))
    .limit(1);
  return rows[0] ?? null;
}

export function v1Routes(app: Hono<AppEnv>) {
  app.use(
    "/v1/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/v1/info", async (c) => {
    const host = await hostFromAppId(c);
    if (!isHost(host)) return sendError(c, host.status, host.code, host.message);
    const db = getDb(c.env.DB);
    const config = await getConfig(db);
    if (!(await rateLimit(c.env.KV, `info:${host.id}`, config.rateInfoPerMin))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    return c.json(unionInfoResponse(config, isSelfHidden(host)));
  });

  app.get("/v1/apps/recommend", async (c) => {
    const host = await hostFromAppId(c);
    if (!isHost(host)) return sendError(c, host.status, host.code, host.message);
    const db = getDb(c.env.DB);
    const q = z
      .object({
        platform: z.enum(PLATFORMS),
        limit: z.coerce.number().int().min(1).max(RECOMMEND_MAX).optional(),
      })
      .safeParse(c.req.query());
    if (!q.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请指定 platform（android / ios / harmonyos）");
    }
    if (!(await hostHasPlatform(db, host.id, q.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    const config = await getConfig(db);
    if (!(await rateLimit(c.env.KV, `rec:${host.id}`, config.rateRecommendPerMin))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    const limit = Math.min(q.data.limit ?? host.listSize, host.listSize, RECOMMEND_MAX);
    if (isSelfHidden(host)) {
      return c.json(hiddenRecommendResponse());
    }
    if (host.reviewStatus === "pending") {
      return c.json(visibleRecommendResponse(mockRecommend(q.data.platform, limit), true));
    }
    const items = await recommendItems(db, c.env.KV, host.id, q.data.platform, limit);
    await rememberRecent(
      c.env.KV,
      host.id,
      items.map((i) => i.id),
    );
    return c.json(visibleRecommendResponse(items));
  });

  app.get("/v1/apps", async (c) => {
    const host = await hostFromAppId(c);
    if (!isHost(host)) return sendError(c, host.status, host.code, host.message);
    const db = getDb(c.env.DB);
    const q = z
      .object({
        platform: z.enum(PLATFORMS),
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(LIST_MAX_PAGE_SIZE).default(LIST_DEFAULT_PAGE_SIZE),
      })
      .safeParse(c.req.query());
    if (!q.success) return sendError(c, 400, ERROR_CODES.invalid_params, "请指定 platform，分页参数无效");
    if (!(await hostHasPlatform(db, host.id, q.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    const config = await getConfig(db);
    if (!(await rateLimit(c.env.KV, `list:${host.id}`, config.rateListPerMin))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    const { platform, page, page_size } = q.data;
    if (isSelfHidden(host)) {
      return c.json(hiddenListResponse(page, page_size));
    }
    if (host.reviewStatus === "pending") {
      return c.json(visibleListResponse(mockList(platform, page, page_size), true));
    }
    const data = await listItems(db, host.id, platform, page, page_size);
    await rememberRecent(
      c.env.KV,
      host.id,
      data.items.map((i) => i.id),
    );
    return c.json(visibleListResponse(data));
  });

  app.get("/v1/apps/:id", async (c) => {
    const host = await hostFromAppId(c);
    if (!isHost(host)) return sendError(c, host.status, host.code, host.message);
    const db = getDb(c.env.DB);
    const id = z.string().uuid().safeParse(c.req.param("id"));
    const q = z.object({ platform: z.enum(PLATFORMS) }).safeParse(c.req.query());
    if (!id.success || !q.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请指定 platform，应用 id 无效");
    }
    if (!(await hostHasPlatform(db, host.id, q.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    const config = await getConfig(db);
    if (!(await rateLimit(c.env.KV, `detail:${host.id}`, config.rateListPerMin))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    if (isSelfHidden(host)) {
      return c.json(hiddenDetailResponse());
    }
    if (host.reviewStatus === "pending") {
      const item = mockDetail(id.data, q.data.platform);
      if (!item) return sendError(c, 404, ERROR_CODES.target_not_found, "应用不存在");
      return c.json(visibleDetailResponse(item, true));
    }
    const item = await appDetail(db, host.id, id.data, q.data.platform);
    if (!item) return sendError(c, 404, ERROR_CODES.target_not_found, "应用不存在");
    return c.json(visibleDetailResponse(item));
  });

  app.post("/v1/events/impressions", async (c) => {
    const host = await hostFromAppId(c);
    if (!isHost(host)) return sendError(c, host.status, host.code, host.message);
    const db = getDb(c.env.DB);
    const body = z
      .object({
        platform: z.enum(PLATFORMS),
        client_id: z.string().uuid(),
        impressions: z
          .array(
            z.object({
              app_id: z.string().uuid(),
              idempotency_key: z.string().uuid(),
              visible: z.literal(true),
            }),
          )
          .min(1)
          .max(IMPRESSION_BATCH_MAX),
      })
      .safeParse(await readJson(c));
    if (!body.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "Invalid impression payload");
    }
    if (!(await hostHasPlatform(db, host.id, body.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    const config = await getConfig(db);
    if (!(await rateLimit(c.env.KV, `imp:${host.id}`, config.rateImpressionsPerMin))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "Rate limited");
    }

    if (host.reviewStatus === "pending") {
      return c.json({
        results: body.data.impressions.map((item) => {
          if (item.app_id === host.id) {
            return {
              app_id: item.app_id,
              idempotency_key: item.idempotency_key,
              accepted: false,
              reason: "self",
            };
          }
          if (isMockAppId(item.app_id)) {
            return {
              app_id: item.app_id,
              idempotency_key: item.idempotency_key,
              accepted: true,
            };
          }
          return {
            app_id: item.app_id,
            idempotency_key: item.idempotency_key,
            accepted: false,
            reason: "not_visible_in_catalog",
          };
        }),
      });
    }

    const results: { app_id: string; idempotency_key: string; accepted: boolean; reason?: string }[] =
      [];
    for (const item of body.data.impressions) {
      if (item.app_id === host.id) {
        results.push({ ...item, app_id: item.app_id, accepted: false, reason: "self" });
        continue;
      }
      const targets = await db.select().from(apps).where(eq(apps.id, item.app_id)).limit(1);
      const target = targets[0];
      if (!target) {
        results.push({
          app_id: item.app_id,
          idempotency_key: item.idempotency_key,
          accepted: false,
          reason: "not_visible_in_catalog",
        });
        continue;
      }
      const listing = await listingFor(db, item.app_id, body.data.platform);
      if (!listing) {
        results.push({
          app_id: item.app_id,
          idempotency_key: item.idempotency_key,
          accepted: false,
          reason: "platform_mismatch",
        });
        continue;
      }
      if (!isCatalogVisible(target)) {
        results.push({
          app_id: item.app_id,
          idempotency_key: item.idempotency_key,
          accepted: false,
          reason: "not_visible_in_catalog",
        });
        continue;
      }
      const dupKey = await db
        .select()
        .from(impressionEvents)
        .where(
          and(
            eq(impressionEvents.hostAppId, host.id),
            eq(impressionEvents.idempotencyKey, item.idempotency_key),
          ),
        )
        .limit(1);
      if (dupKey[0]) {
        results.push({
          app_id: item.app_id,
          idempotency_key: item.idempotency_key,
          accepted: false,
          reason: "duplicate",
        });
        continue;
      }
      const windowOk = await impressionDedupSet(
        c.env.KV,
        host.id,
        item.app_id,
        body.data.client_id,
        config.impressionDedupMinutes * 60,
      );
      if (!windowOk) {
        results.push({
          app_id: item.app_id,
          idempotency_key: item.idempotency_key,
          accepted: false,
          reason: "duplicate",
        });
        continue;
      }
      try {
        await db.insert(impressionEvents).values({
          hostAppId: host.id,
          targetAppId: item.app_id,
          clientId: body.data.client_id,
          idempotencyKey: item.idempotency_key,
        });
        await bumpStats(db, { hostId: host.id, targetId: item.app_id, impression: true });
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: true });
      } catch {
        results.push({
          app_id: item.app_id,
          idempotency_key: item.idempotency_key,
          accepted: false,
          reason: "duplicate",
        });
      }
    }
    return c.json({ results });
  });

  app.post("/v1/events/clicks", async (c) => {
    const host = await hostFromAppId(c);
    if (!isHost(host)) return sendError(c, host.status, host.code, host.message);
    const db = getDb(c.env.DB);
    const body = z
      .object({
        platform: z.enum(PLATFORMS),
        client_id: z.string().uuid(),
        app_id: z.string().uuid(),
        idempotency_key: z.string().uuid(),
      })
      .safeParse(await readJson(c));
    if (!body.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "Invalid click payload");
    }
    if (!(await hostHasPlatform(db, host.id, body.data.platform))) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "宿主未配置该端");
    }
    const config = await getConfig(db);
    if (!(await rateLimit(c.env.KV, `clk:${host.id}`, config.rateClicksPerMin))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    const { platform, client_id, app_id, idempotency_key } = body.data;
    if (host.reviewStatus === "pending") {
      if (app_id === host.id) return c.json({ accepted: false, reason: "self" });
      if (isMockAppId(app_id)) return c.json({ accepted: true });
      return c.json({ accepted: false, reason: "not_visible_in_catalog" });
    }
    if (app_id === host.id) return c.json({ accepted: false, reason: "self" });
    const targets = await db.select().from(apps).where(eq(apps.id, app_id)).limit(1);
    const target = targets[0];
    const listing = await listingFor(db, app_id, platform);
    if (!target || !listing || !isCatalogVisible(target)) {
      return c.json({ accepted: false, reason: "not_visible_in_catalog" });
    }
    const existing = await db
      .select()
      .from(clickEvents)
      .where(and(eq(clickEvents.hostAppId, host.id), eq(clickEvents.idempotencyKey, idempotency_key)))
      .limit(1);
    if (existing[0]) return c.json({ accepted: false, reason: "duplicate" });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const imps = await db
      .select()
      .from(impressionEvents)
      .where(
        and(
          eq(impressionEvents.hostAppId, host.id),
          eq(impressionEvents.targetAppId, app_id),
          eq(impressionEvents.clientId, client_id),
          gte(impressionEvents.occurredAt, since),
        ),
      )
      .limit(1);
    if (!imps[0]) return c.json({ accepted: false, reason: "no_recent_impression" });
    const recent = await recentUnion(c.env.KV, host.id);
    if (!recent.has(app_id)) return c.json({ accepted: false, reason: "not_in_recent_list" });
    try {
      await db.insert(clickEvents).values({
        hostAppId: host.id,
        targetAppId: app_id,
        clientId: client_id,
        idempotencyKey: idempotency_key,
      });
      await bumpStats(db, { hostId: host.id, targetId: app_id, click: true });
      return c.json({ accepted: true });
    } catch {
      return c.json({ accepted: false, reason: "duplicate" });
    }
  });
}
