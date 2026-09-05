import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { developers } from "@appunions/db/schema";
import { ERROR_CODES } from "@appunions/shared";
import { db } from "../db.js";
import { env } from "../env.js";
import { sendError } from "../errors.js";
import { clearAuthCookies, mustUser, requireUser, setAuthCookies } from "../lib/session.js";
import { sendLoginCode } from "../lib/mail.js";
import { consumeOtp, randomOtp, saveOtp } from "../lib/otp.js";
import { rateLimit } from "../lib/redis-ops.js";

const emailBody = z.object({ email: z.string().email() });
const verifyBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function dashboardAuthRoutes(app: FastifyInstance) {
  app.post("/dashboard/auth/send-code", async (request, reply) => {
    const parsed = emailBody.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "请填写有效邮箱");
    }
    const email = parsed.data.email.toLowerCase();
    if (!(await rateLimit(`sendcode:ip:${request.ip}`, 10, 3600))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "发送太频繁，请稍后再试");
    }
    if (!(await rateLimit(`sendcode:${email}`, 1, 60))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "验证码已发送，请 1 分钟后再试");
    }
    const code = randomOtp();
    await saveOtp(email, code);
    let emailed = false;
    try {
      emailed = await sendLoginCode(email, code);
    } catch (err) {
      request.log.error(err);
      return sendError(reply, 500, ERROR_CODES.internal_error, "验证码发送失败");
    }
    if (!emailed) {
      request.log.info({ email }, `login code ${code}`);
    }
    return {
      sent: true,
      emailed,
      ...(env.AUTH_ECHO_CODE && !emailed ? { devCode: code } : {}),
    };
  });

  app.post("/dashboard/auth/verify", async (request, reply) => {
    const parsed = verifyBody.safeParse(request.body);
    const email = parsed.success ? parsed.data.email.toLowerCase() : "";
    if (!(await rateLimit(`verify:${request.ip}`, 20, 600))) {
      return sendError(reply, 429, ERROR_CODES.rate_limited, "试太多次，请稍后再试");
    }
    if (!parsed.success) {
      return sendError(reply, 400, ERROR_CODES.invalid_params, "请输入 6 位验证码");
    }
    const ok = await consumeOtp(email, parsed.data.code);
    if (!ok) {
      return sendError(reply, 401, ERROR_CODES.unauthorized, "验证码不对或已过期");
    }
    let rows = await db.select().from(developers).where(eq(developers.email, email)).limit(1);
    let user = rows[0];
    if (!user) {
      const inserted = await db
        .insert(developers)
        .values({ email, passwordHash: "otp", role: "developer" })
        .returning();
      user = inserted[0]!;
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
