import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("developer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apps = pgTable(
  "apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    name: text("name").notNull(),
    iconUrl: text("icon_url").notNull(),
    tagline: text("tagline").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull().default("其他"),
    reviewStatus: text("review_status").notNull().default("pending"),
    pausedByDeveloper: boolean("paused_by_developer").notNull().default(false),
    pausedByOps: boolean("paused_by_ops").notNull().default(false),
    rejectedReason: text("rejected_reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    inRecommendPool: boolean("in_recommend_pool").notNull().default(false),
    contributedImpressions7d: integer("contributed_impressions_7d").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    poolIdx: index("apps_pool_idx").on(t.inRecommendPool),
    developerIdx: index("apps_developer_idx").on(t.developerId),
  }),
);

export const appPlatforms = pgTable(
  "app_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    packageName: text("package_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    hashUnique: uniqueIndex("api_keys_hash_uidx").on(t.keyHash),
    oneActive: uniqueIndex("api_keys_one_active_uidx")
      .on(t.appId)
      .where(sql`${t.revokedAt} is null`),
  }),
);

export const appReviews = pgTable("app_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id")
    .notNull()
    .references(() => apps.id),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => developers.id),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const impressionEvents = pgTable(
  "impression_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostAppId: uuid("host_app_id")
      .notNull()
      .references(() => apps.id),
    targetAppId: uuid("target_app_id")
      .notNull()
      .references(() => apps.id),
    clientId: uuid("client_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: uuid("id").primaryKey().defaultRandom(),
    hostAppId: uuid("host_app_id")
      .notNull()
      .references(() => apps.id),
    targetAppId: uuid("target_app_id")
      .notNull()
      .references(() => apps.id),
    clientId: uuid("client_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
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
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    day: date("day").notNull(),
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
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id")
    .notNull()
    .references(() => apps.id),
  type: text("type").notNull(),
  window: text("window").notNull().default("7d"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type Developer = typeof developers.$inferSelect;
export type App = typeof apps.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type AppPlatform = typeof appPlatforms.$inferSelect;
export type PlatformConfig = typeof platformConfig.$inferSelect;
