import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  apiKeys,
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
  RECOMMEND_MAX,
} from "@appunions/shared";
import { db } from "../db.js";
import { sendError } from "../errors.js";
import { hashApiKey } from "../lib/api-keys.js";
import { pickRandom } from "../lib/random.js";
import {
  impressionDedupSet,
  rateLimit,
  recentUnion,
  rememberRecent,
} from "../lib/redis-ops.js";
import { redis } from "../redis.js";
import { bumpStats } from "../lib/stats.js";

type Host = typeof apps.$inferSelect;

async function hostFromKey(request: FastifyRequest): Promise<Host | { error: true; status: number; code: typeof ERROR_CODES[keyof typeof ERROR_CODES]; message: string }> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return { error: true, status: 401, code: ERROR_CODES.unauthorized, message: "Invalid API key" };
  }
  const token = header.slice("Bearer ".length).trim();
  const hash = hashApiKey(token);
  const keyRows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  const key = keyRows[0];
  if (!key || key.revokedAt) {
    return { error: true, status: 401, code: ERROR_CODES.unauthorized, message: "Invalid API key" };
  }
  const appRows = await db.select().from(apps).where(eq(apps.id, key.appId)).limit(1);
  const host = appRows[0];
  if (!host) {
    return { error: true, status: 401, code: ERROR_CODES.unauthorized, message: "Invalid API key" };
  }
  if (host.reviewStatus !== "approved") {
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

function isHost(v: Awaited<ReturnType<typeof hostFromKey>>): v is Host {
  return !("error" in v);
}

function dto(app: Host) {
  return {
    id: app.id,
    name: app.name,
    icon_url: app.iconUrl,
    tagline: app.tagline,
    category: app.category,
    platform: app.platform,
    store_url: app.storeUrl,
    deeplink: app.deeplink,
  };
}

async function poolIds(platform: string, cacheSec: number) {
  const cacheKey = `pool:${platform}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as string[];
  const rows = await db
    .select({ id: apps.id })
    .from(apps)
    .where(and(eq(apps.platform, platform), eq(apps.inRecommendPool, true)));
  const ids = rows.map((r) => r.id);
  await redis.set(cacheKey, JSON.stringify(ids), "EX", cacheSec);
  return ids;
}

export async function v1Routes(app: FastifyInstance) {
  app.get("/v1/apps/recommend", async (request, reply) => {
    const host = await hostFromKey(request);
    if (!isHost(host)) return sendError(reply, host.status, host.code, host.message);
    const config = await getConfig(db);
    if (!(await rateLimit(`rec:${host.id}`, config.rateRecommendPerMin))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(RECOMMEND_MAX).default(RECOMMEND_MAX) })
      .safeParse(request.query);
    const limit = q.success ? q.data.limit : RECOMMEND_MAX;
    const ids = (await poolIds(host.platform, config.recommendCacheSeconds)).filter((id) => id !== host.id);
    const picked = pickRandom(ids, limit);
    const rows =
      picked.length === 0 ? [] : await db.select().from(apps).where(inArray(apps.id, picked));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = picked.map((id) => byId.get(id)).filter((r): r is Host => Boolean(r)).map(dto);
    await rememberRecent(
      host.id,
      items.map((i) => i.id),
    );
    return { items };
  });

  app.get("/v1/apps", async (request, reply) => {
    const host = await hostFromKey(request);
    if (!isHost(host)) return sendError(reply, host.status, host.code, host.message);
    const config = await getConfig(db);
    if (!(await rateLimit(`list:${host.id}`, config.rateListPerMin))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(LIST_MAX_PAGE_SIZE).default(LIST_DEFAULT_PAGE_SIZE),
      })
      .safeParse(request.query);
    if (!q.success) return sendError(reply, 400, ERROR_CODES.invalid_params, "Invalid pagination");
    const { page, page_size } = q.data;
    const where = and(
      eq(apps.platform, host.platform),
      eq(apps.reviewStatus, "approved"),
      eq(apps.pausedByDeveloper, false),
      eq(apps.pausedByOps, false),
      ne(apps.id, host.id),
    );
    const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(apps).where(where);
    const total = countRows[0]?.n ?? 0;
    const rows = await db
      .select()
      .from(apps)
      .where(where)
      .orderBy(desc(apps.createdAt), desc(apps.id))
      .limit(page_size)
      .offset((page - 1) * page_size);
    await rememberRecent(
      host.id,
      rows.map((r) => r.id),
    );
    return {
      items: rows.map(dto),
      page,
      page_size,
      total,
    };
  });

  app.post("/v1/events/impressions", async (request, reply) => {
    const host = await hostFromKey(request);
    if (!isHost(host)) return sendError(reply, host.status, host.code, host.message);
    const config = await getConfig(db);
    const body = z
      .object({
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
      .safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "Invalid impression payload");
    }
    if (!(await rateLimit(`imp:${host.id}`, config.rateImpressionsPerMin))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "Rate limited");
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
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: false, reason: "not_visible_in_catalog" });
        continue;
      }
      if (target.platform !== host.platform) {
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: false, reason: "platform_mismatch" });
        continue;
      }
      if (!isCatalogVisible(target)) {
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: false, reason: "not_visible_in_catalog" });
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
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: false, reason: "duplicate" });
        continue;
      }
      const windowOk = await impressionDedupSet(
        host.id,
        item.app_id,
        body.data.client_id,
        config.impressionDedupMinutes * 60,
      );
      if (!windowOk) {
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: false, reason: "duplicate" });
        continue;
      }
      try {
        await db.transaction(async (tx) => {
          await tx.insert(impressionEvents).values({
            hostAppId: host.id,
            targetAppId: item.app_id,
            clientId: body.data.client_id,
            idempotencyKey: item.idempotency_key,
          });
        });
        await bumpStats({ hostId: host.id, targetId: item.app_id, impression: true });
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: true });
      } catch {
        results.push({ app_id: item.app_id, idempotency_key: item.idempotency_key, accepted: false, reason: "duplicate" });
      }
    }
    return { results };
  });

  app.post("/v1/events/clicks", async (request, reply) => {
    const host = await hostFromKey(request);
    if (!isHost(host)) return sendError(reply, host.status, host.code, host.message);
    const config = await getConfig(db);
    if (!(await rateLimit(`clk:${host.id}`, config.rateClicksPerMin))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "Rate limited");
    }
    const body = z
      .object({
        client_id: z.string().uuid(),
        app_id: z.string().uuid(),
        idempotency_key: z.string().uuid(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "Invalid click payload");
    }
    const { client_id, app_id, idempotency_key } = body.data;
    if (app_id === host.id) return { accepted: false, reason: "self" };
    const targets = await db.select().from(apps).where(eq(apps.id, app_id)).limit(1);
    const target = targets[0];
    if (!target || target.platform !== host.platform || !isCatalogVisible(target)) {
      return { accepted: false, reason: "not_visible_in_catalog" };
    }
    const existing = await db
      .select()
      .from(clickEvents)
      .where(and(eq(clickEvents.hostAppId, host.id), eq(clickEvents.idempotencyKey, idempotency_key)))
      .limit(1);
    if (existing[0]) return { accepted: false, reason: "duplicate" };
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
    if (!imps[0]) return { accepted: false, reason: "no_recent_impression" };
    const recent = await recentUnion(host.id);
    if (!recent.has(app_id)) return { accepted: false, reason: "not_in_recent_list" };
    try {
      await db.insert(clickEvents).values({
        hostAppId: host.id,
        targetAppId: app_id,
        clientId: client_id,
        idempotencyKey: idempotency_key,
      });
      await bumpStats({ hostId: host.id, targetId: app_id, click: true });
      return { accepted: true };
    } catch {
      return { accepted: false, reason: "duplicate" };
    }
  });
}
