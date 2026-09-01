import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { developers } from "@appunions/db/schema";
import { ERROR_CODES } from "@appunions/shared";
import { db } from "../db.js";
import { sendError } from "../errors.js";
import { clearAuthCookies, mustUser, requireUser, setAuthCookies } from "../lib/session.js";
import { rateLimit } from "../lib/redis-ops.js";

const creds = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function dashboardAuthRoutes(app: FastifyInstance) {
  app.post("/dashboard/auth/register", async (request, reply) => {
    const ip = request.ip;
    if (!(await rateLimit(`auth:${ip}`, 20))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "Too many attempts");
    }
    const parsed = creds.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "Invalid email or password");
    }
    const email = parsed.data.email.toLowerCase();
    const exists = await db.select().from(developers).where(eq(developers.email, email)).limit(1);
    if (exists[0]) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "该邮箱已注册，请直接登录");
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [user] = await db
      .insert(developers)
      .values({ email, passwordHash, role: "developer" })
      .returning();
    await setAuthCookies(reply, user!.id, user!.role);
    return { id: user!.id, email: user!.email, role: user!.role };
  });

  app.post("/dashboard/auth/login", async (request, reply) => {
    const ip = request.ip;
    const parsed = creds.safeParse(request.body);
    const email = parsed.success ? parsed.data.email.toLowerCase() : "";
    if (!(await rateLimit(`login:${ip}:${email}`, 10))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "试太多次，请稍后再试");
    }
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "邮箱或密码不对");
    }
    const rows = await db.select().from(developers).where(eq(developers.email, email)).limit(1);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return sendError(reply, 401, ERROR_CODES.unauthorized, "邮箱或密码不对");
    }
    await setAuthCookies(reply, user.id, user.role);
    return { id: user.id, email: user.email, role: user.role };
  });

  app.post("/dashboard/auth/logout", async (_request, reply) => {
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.get("/dashboard/auth/me", { preHandler: requireUser() }, async (request) => {
    const { id } = mustUser(request);
    const rows = await db.select().from(developers).where(eq(developers.id, id)).limit(1);
    const user = rows[0];
    if (!user) {
      return { id, email: "", role: "developer" };
    }
    return { id: user.id, email: user.email, role: user.role };
  });
}
