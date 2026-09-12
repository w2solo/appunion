import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { developers } from "@appunions/db/schema";
import { ERROR_CODES, isSuperAdminEmail } from "@appunions/shared";
import { getDb } from "../db.js";
import { clientIp, flagEnabled, readJson, type AppEnv } from "../context.js";
import { sendError } from "../errors.js";
import { clearAuthCookies, mustUser, publicUser, requireUser, setAuthCookies } from "../lib/session.js";
import { sendLoginCode } from "../lib/mail.js";
import { consumeOtp, randomOtp, saveOtp } from "../lib/otp.js";
import { consumeInvite, findActiveInvite } from "../lib/invites.js";
import { rateLimit } from "../kv.js";

const emailBody = z.object({
  email: z.string().email(),
  inviteCode: z.string().optional(),
});
const verifyBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  inviteCode: z.string().optional(),
});

const INVITE_REQUIRED_MESSAGE = "该邮箱尚未注册。本站为邀请制，请向管理员获取邀请码后再注册。";
const INVITE_INVALID_MESSAGE = "邀请码无效或已被使用";

export function dashboardAuthRoutes(app: Hono<AppEnv>) {
  app.post("/dashboard/auth/send-code", async (c) => {
    const parsed = emailBody.safeParse(await readJson(c));
    if (!parsed.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请填写有效邮箱");
    }
    const email = parsed.data.email.toLowerCase();
    const db = getDb(c.env.DB);
    const existing = await db.select({ id: developers.id }).from(developers).where(eq(developers.email, email)).limit(1);
    if (!existing[0] && !isSuperAdminEmail(email, c.env.SUPER_ADMIN_EMAIL)) {
      if (!parsed.data.inviteCode?.trim()) {
        return sendError(c, 403, ERROR_CODES.invite_required, INVITE_REQUIRED_MESSAGE);
      }
      const invite = await findActiveInvite(db, parsed.data.inviteCode);
      if (!invite) {
        return sendError(c, 400, ERROR_CODES.invite_invalid, INVITE_INVALID_MESSAGE);
      }
    }
    if (!(await rateLimit(c.env.KV, `sendcode:ip:${clientIp(c)}`, 10, 3600))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "发送太频繁，请稍后再试");
    }
    if (!(await rateLimit(c.env.KV, `sendcode:${email}`, 1, 60))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "验证码已发送，请 1 分钟后再试");
    }
    const code = randomOtp();
    await saveOtp(c.env.KV, c.env.JWT_SECRET, email, code);
    let emailed = false;
    try {
      emailed = await sendLoginCode(c.env, email, code);
    } catch (err) {
      console.error(err);
      return sendError(c, 500, ERROR_CODES.internal_error, "验证码发送失败");
    }
    if (!emailed) {
      console.log(`login code ${code}`, { email });
    }
    return c.json({
      sent: true,
      emailed,
      ...(flagEnabled(c.env.AUTH_ECHO_CODE) && !emailed ? { devCode: code } : {}),
    });
  });

  app.post("/dashboard/auth/verify", async (c) => {
    const parsed = verifyBody.safeParse(await readJson(c));
    const email = parsed.success ? parsed.data.email.toLowerCase() : "";
    if (!(await rateLimit(c.env.KV, `verify:${clientIp(c)}`, 20, 600))) {
      return sendError(c, 429, ERROR_CODES.rate_limited, "试太多次，请稍后再试");
    }
    if (!parsed.success) {
      return sendError(c, 400, ERROR_CODES.invalid_params, "请输入 6 位验证码");
    }
    const db = getDb(c.env.DB);
    let rows = await db.select().from(developers).where(eq(developers.email, email)).limit(1);
    let user = rows[0];
    const superAdmin = isSuperAdminEmail(email, c.env.SUPER_ADMIN_EMAIL);
    let invite = null;
    if (!user && !superAdmin) {
      if (!parsed.data.inviteCode?.trim()) {
        return sendError(c, 403, ERROR_CODES.invite_required, INVITE_REQUIRED_MESSAGE);
      }
      invite = await findActiveInvite(db, parsed.data.inviteCode);
      if (!invite) {
        return sendError(c, 400, ERROR_CODES.invite_invalid, INVITE_INVALID_MESSAGE);
      }
    }
    const ok = await consumeOtp(c.env.KV, c.env.JWT_SECRET, email, parsed.data.code);
    if (!ok) {
      return sendError(c, 401, ERROR_CODES.unauthorized, "验证码不对或已过期");
    }
    if (!user) {
      if (superAdmin) {
        const inserted = await db
          .insert(developers)
          .values({
            email,
            passwordHash: "otp",
            role: "admin",
          })
          .returning();
        user = inserted[0]!;
      } else {
        try {
          user = await db.transaction(async (tx) => {
            const [inserted] = await tx
              .insert(developers)
              .values({
                email,
                passwordHash: "otp",
                role: "developer",
              })
              .returning();
            const consumed = await consumeInvite(tx, invite!, inserted!.id);
            if (!consumed) {
              throw new Error("invite_taken");
            }
            return inserted!;
          });
        } catch {
          return sendError(c, 400, ERROR_CODES.invite_invalid, INVITE_INVALID_MESSAGE);
        }
      }
    } else if (superAdmin && user.role !== "admin") {
      const [updated] = await db
        .update(developers)
        .set({ role: "admin" })
        .where(eq(developers.id, user.id))
        .returning();
      user = updated!;
    }
    await setAuthCookies(c, user.id, publicUser(user, c.env.SUPER_ADMIN_EMAIL).role);
    return c.json({
      ...publicUser(user, c.env.SUPER_ADMIN_EMAIL),
      superAdminEmail: c.env.SUPER_ADMIN_EMAIL || undefined,
    });
  });

  app.post("/dashboard/auth/logout", async (c) => {
    clearAuthCookies(c);
    return c.json({ ok: true });
  });

  app.get("/dashboard/auth/me", requireUser, async (c) => {
    const { id } = mustUser(c);
    const db = getDb(c.env.DB);
    const rows = await db.select().from(developers).where(eq(developers.id, id)).limit(1);
    const user = rows[0];
    if (!user) {
      return c.json({ id, email: "", role: "developer", superAdmin: false });
    }
    if (isSuperAdminEmail(user.email, c.env.SUPER_ADMIN_EMAIL) && user.role !== "admin") {
      await db.update(developers).set({ role: "admin" }).where(eq(developers.id, user.id));
      user.role = "admin";
    }
    return c.json({
      ...publicUser(user, c.env.SUPER_ADMIN_EMAIL),
      superAdminEmail: c.env.SUPER_ADMIN_EMAIL || undefined,
    });
  });
}
