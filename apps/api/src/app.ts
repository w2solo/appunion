import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { ERROR_CODES } from "@appunions/shared";
import type { AppEnv } from "./context.js";
import { HttpError } from "./errors.js";
import { iconContentType } from "./icons.js";
import { mockIconSvg } from "./lib/mock-catalog.js";
import { dashboardAuthRoutes } from "./routes/dashboard-auth.js";
import { dashboardAppRoutes } from "./routes/dashboard-apps.js";
import { adminRoutes } from "./routes/admin.js";
import { v1Routes } from "./routes/v1.js";
import { runScheduled } from "./scheduled.js";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: ERROR_CODES.internal_error, message: "Internal error" } }, 500);
});

app.get("/health", async (c) => {
  try {
    await c.env.DB.execute(sql`select 1`);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

app.get("/media/mock-icons/:file", (c) => {
  const file = c.req.param("file");
  if (!file.endsWith(".svg") || file.includes("..") || file.includes("/")) {
    return c.body(null, 400);
  }
  const svg = mockIconSvg(file.slice(0, -".svg".length));
  if (!svg) return c.body(null, 404);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

app.get("/media/icons/:file", async (c) => {
  const file = c.req.param("file");
  if (file.includes("..") || file.includes("/")) {
    return c.body(null, 400);
  }
  const obj = await c.env.ICONS.get(`icons/${file}`);
  if (!obj) return c.body(null, 404);
  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType || iconContentType(file),
      "Cache-Control": "public, max-age=86400",
    },
  });
});

app.post("/internal/jobs/:job", async (c) => {
  const secret = c.env.CRON_SECRET;
  const auth = c.req.header("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return c.body(null, 401);
  }
  const job = c.req.param("job");
  const cron =
    job === "pool" ? "*/5 * * * *" : job === "anomalies" ? "0 */6 * * *" : job === "reconcile" ? "15 0 * * *" : null;
  if (!cron) return c.body(null, 404);
  await runScheduled(cron, c.env);
  return c.json({ ok: true });
});

dashboardAuthRoutes(app);
dashboardAppRoutes(app);
adminRoutes(app);
v1Routes(app);
