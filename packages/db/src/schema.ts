import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = (name = "id") => text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = (name = "created_at") =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date());
const optionalTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const bool = (name: string, fallback = false) => boolean(name).notNull().default(fallback);

export const developers = pgTable(
  "developers",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("developer"),
    createdAt: createdAt(),
  },
  (t) => ({
    emailUidx: uniqueIndex("developers_email_uidx").on(t.email),
  }),
);

export const apps = pgTable(
  "apps",
  {
    id: id(),
    developerId: text("developer_id")
      .notNull()
      .references(() => developers.id),
    name: text("name").notNull(),
    iconUrl: text("icon_url").notNull(),
    tagline: text("tagline").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull().default("其他"),
    reviewStatus: text("review_status").notNull().default("pending"),
    pausedByDeveloper: bool("paused_by_developer"),
    pausedByOps: bool("paused_by_ops"),
    rejectedReason: text("rejected_reason"),
    approvedAt: optionalTimestamp("approved_at"),
    inRecommendPool: bool("in_recommend_pool"),
    contributedImpressions7d: integer("contributed_impressions_7d").notNull().default(0),
    listSize: integer("list_size").notNull().default(10),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    poolIdx: index("apps_pool_idx").on(t.inRecommendPool),
    developerIdx: index("apps_developer_idx").on(t.developerId),
  }),
);

export const appPlatforms = pgTable(
  "app_platforms",
  {
    id: id(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    packageName: text("package_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    appPlatformUidx: uniqueIndex("app_platforms_app_platform_uidx").on(t.appId, t.platform),
    packageUidx: uniqueIndex("app_platforms_platform_package_uidx").on(t.platform, t.packageName),
    platformIdx: index("app_platforms_platform_idx").on(t.platform),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: createdAt(),
    revokedAt: optionalTimestamp("revoked_at"),
  },
  (t) => ({
    hashUnique: uniqueIndex("api_keys_hash_uidx").on(t.keyHash),
    oneActive: uniqueIndex("api_keys_one_active_uidx")
      .on(t.appId)
      .where(sql`${t.revokedAt} is null`),
  }),
);

export const appReviews = pgTable("app_reviews", {
  id: id(),
  appId: text("app_id")
    .notNull()
    .references(() => apps.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => developers.id),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
});

export const impressionEvents = pgTable(
  "impression_events",
  {
    id: id(),
    hostAppId: text("host_app_id")
      .notNull()
      .references(() => apps.id),
    targetAppId: text("target_app_id")
      .notNull()
      .references(() => apps.id),
    clientId: text("client_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    occurredAt: createdAt("occurred_at"),
  },
  (t) => ({
    hostIdempotent: uniqueIndex("impressions_host_idem_uidx").on(t.hostAppId, t.idempotencyKey),
    hostTime: index("impressions_host_time_idx").on(t.hostAppId, t.occurredAt),
    targetTime: index("impressions_target_time_idx").on(t.targetAppId, t.occurredAt),
    dedup: index("impressions_dedup_idx").on(t.hostAppId, t.targetAppId, t.clientId, t.occurredAt),
  }),
);

export const clickEvents = pgTable(
  "click_events",
  {
    id: id(),
    hostAppId: text("host_app_id")
      .notNull()
      .references(() => apps.id),
    targetAppId: text("target_app_id")
      .notNull()
      .references(() => apps.id),
    clientId: text("client_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    occurredAt: createdAt("occurred_at"),
  },
  (t) => ({
    hostIdempotent: uniqueIndex("clicks_host_idem_uidx").on(t.hostAppId, t.idempotencyKey),
    hostTime: index("clicks_host_time_idx").on(t.hostAppId, t.occurredAt),
    targetTime: index("clicks_target_time_idx").on(t.targetAppId, t.occurredAt),
  }),
);

export const appDailyStats = pgTable(
  "app_daily_stats",
  {
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    day: text("day").notNull(),
    impressionsReceived: integer("impressions_received").notNull().default(0),
    clicksReceived: integer("clicks_received").notNull().default(0),
    impressionsGiven: integer("impressions_given").notNull().default(0),
    clicksGiven: integer("clicks_given").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.appId, t.day] }),
  }),
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    createdAt: createdAt(),
  },
  (t) => ({
    parentIdx: index("categories_parent_idx").on(t.parentId),
  }),
);

export const platformConfig = pgTable("platform_config", {
  id: integer("id").primaryKey().default(1),
  graceDays: integer("grace_days").notNull().default(7),
  reciprocityImpressions: integer("reciprocity_impressions").notNull().default(100),
  impressionDedupMinutes: integer("impression_dedup_minutes").notNull().default(30),
  recommendCacheSeconds: integer("recommend_cache_seconds").notNull().default(30),
  rateRecommendPerMin: integer("rate_recommend_per_min").notNull().default(60),
  rateListPerMin: integer("rate_list_per_min").notNull().default(60),
  rateImpressionsPerMin: integer("rate_impressions_per_min").notNull().default(120),
  rateClicksPerMin: integer("rate_clicks_per_min").notNull().default(60),
});

export const anomalyFlags = pgTable("anomaly_flags", {
  id: id(),
  appId: text("app_id")
    .notNull()
    .references(() => apps.id),
  type: text("type").notNull(),
  window: text("window").notNull().default("7d"),
  createdAt: createdAt(),
  resolvedAt: optionalTimestamp("resolved_at"),
});

export type Developer = typeof developers.$inferSelect;
export type App = typeof apps.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type AppPlatform = typeof appPlatforms.$inferSelect;
export type PlatformConfig = typeof platformConfig.$inferSelect;
