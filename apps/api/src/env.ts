import type { AppDb } from "@appunions/db";
import type { CacheStore } from "./cache.js";
import type { IconStore } from "./icons.js";

export type Env = {
  DB: AppDb;
  KV: CacheStore;
  ICONS: IconStore;
  JWT_SECRET: string;
  COOKIE_SECURE: string;
  AUTH_ECHO_CODE: string;
  SENDCLOUD_FROM_NAME: string;
  SENDCLOUD_API_USER: string;
  SENDCLOUD_API_KEY: string;
  SENDCLOUD_FROM: string;
  CRON_SECRET: string;
};

export function readProcessEnv() {
  const jwt = process.env.JWT_SECRET ?? "";
  if (jwt.length < 8) {
    throw new Error("JWT_SECRET must be at least 8 characters");
  }
  return {
    JWT_SECRET: jwt,
    COOKIE_SECURE: process.env.COOKIE_SECURE ?? "false",
    AUTH_ECHO_CODE: process.env.AUTH_ECHO_CODE ?? "false",
    SENDCLOUD_FROM_NAME: process.env.SENDCLOUD_FROM_NAME ?? "AppUnions",
    SENDCLOUD_API_USER: process.env.SENDCLOUD_API_USER ?? "",
    SENDCLOUD_API_KEY: process.env.SENDCLOUD_API_KEY ?? "",
    SENDCLOUD_FROM: process.env.SENDCLOUD_FROM ?? "",
    CRON_SECRET: process.env.CRON_SECRET ?? "",
  };
}

export function buildEnv(
  db: AppDb,
  kv: CacheStore,
  icons: IconStore,
  vars: ReturnType<typeof readProcessEnv>,
): Env {
  return { DB: db, KV: kv, ICONS: icons, ...vars };
}
