import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ERROR_CODES } from "@appunions/shared";
import { env } from "./env.js";
import { sql } from "./db.js";
import { redis } from "./redis.js";
import { ensureBucket, localDir } from "./s3.js";
import { seed } from "./seed.js";
import { HttpError, sendError } from "./errors.js";
import { dashboardAuthRoutes } from "./routes/dashboard-auth.js";
import { dashboardAppRoutes } from "./routes/dashboard-apps.js";
import { adminRoutes } from "./routes/admin.js";
import { v1Routes } from "./routes/v1.js";

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 512 * 1024 } });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) {
    return sendError(reply, err.status, err.code, err.message);
  }
  app.log.error(err);
  return sendError(reply, 500, ERROR_CODES.internal_error, "Internal error");
});

app.get("/health", async (_req, reply) => {
  try {
    await sql`select 1`;
    await redis.ping();
    return { ok: true };
  } catch {
    return reply.code(503).send({ ok: false });
  }
});

app.get("/media/icons/:file", async (request, reply) => {
  const file = (request.params as { file: string }).file;
  if (file.includes("..") || file.includes("/")) {
    return reply.code(400).send();
  }
  const full = resolve(localDir, file);
  if (!existsSync(full)) return reply.code(404).send();
  const ext = file.split(".").pop();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  reply.header("Content-Type", type);
  return reply.send(createReadStream(full));
});

await dashboardAuthRoutes(app);
await dashboardAppRoutes(app);
await adminRoutes(app);
await v1Routes(app);

await ensureBucket();
await seed();

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
