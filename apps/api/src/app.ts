import { Hono } from "hono";
import { ERROR_CODES } from "@appunions/shared";
import type { AppEnv } from "./context.js";
import { HttpError } from "./errors.js";
import { iconContentType } from "./r2.js";
import { dashboardAuthRoutes } from "./routes/dashboard-auth.js";
import { dashboardAppRoutes } from "./routes/dashboard-apps.js";
import { adminRoutes } from "./routes/admin.js";
import { v1Routes } from "./routes/v1.js";

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
    await c.env.DB.prepare("select 1").first();
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

app.get("/media/icons/:file", async (c) => {
  const file = c.req.param("file");
  if (file.includes("..") || file.includes("/")) {
    return c.body(null, 400);
  }
  const obj = await c.env.ICONS.get(`icons/${file}`);
  if (!obj) return c.body(null, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": iconContentType(file),
      "Cache-Control": "public, max-age=86400",
    },
  });
});

dashboardAuthRoutes(app);
dashboardAppRoutes(app);
adminRoutes(app);
v1Routes(app);
