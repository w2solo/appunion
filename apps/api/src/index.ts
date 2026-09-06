import { config as loadDotenv } from "dotenv";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cron from "node-cron";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { createMemoryCache } from "./cache.js";
import { createDb } from "./db.js";
import { buildEnv, readProcessEnv } from "./env.js";
import { createDiskIcons } from "./icons.js";
import { seed } from "./seed.js";
import { runScheduled } from "./scheduled.js";
import { attachSpa } from "./spa.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadDotenv({ path: resolve(repoRoot, ".env") });

function iconsDir() {
  const raw = process.env.ICONS_DIR || "./data/icons";
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw);
}

function webDistDir() {
  if (process.env.WEB_DIST) {
    return isAbsolute(process.env.WEB_DIST) ? process.env.WEB_DIST : resolve(repoRoot, process.env.WEB_DIST);
  }
  return resolve(repoRoot, "apps/web/dist");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const { db } = createDb(databaseUrl);
const env = buildEnv(db, createMemoryCache(), await createDiskIcons(iconsDir()), readProcessEnv());
await seed(env.DB);

if (process.env.NODE_ENV === "production") {
  attachSpa(app, webDistDir());
}

const cronOpts = { timezone: "UTC" } as const;
cron.schedule("*/5 * * * *", () => void runScheduled("*/5 * * * *", env), cronOpts);
cron.schedule("0 */6 * * *", () => void runScheduled("0 */6 * * *", env), cronOpts);
cron.schedule("15 0 * * *", () => void runScheduled("15 0 * * *", env), cronOpts);

const port = Number(process.env.PORT || 8787);
serve({ fetch: (request) => app.fetch(request, env), port });
console.log(`api listening on http://127.0.0.1:${port}`);
