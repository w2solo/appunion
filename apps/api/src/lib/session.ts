import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { ERROR_CODES, isSuperAdminEmail } from "@appunions/shared";
import { developers } from "@appunions/db";
import { getDb } from "../db.js";
import type { AppEnv, AuthUser } from "../context.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOpts,
  signAccess,
  signRefresh,
  verifyToken,
} from "./jwt.js";
import { HttpError } from "../errors.js";

export function publicUser(user: { id: string; email: string; role: string }, superAdminEmail?: string) {
  const superAdmin = isSuperAdminEmail(user.email, superAdminEmail);
  return {
    id: user.id,
    email: user.email,
    role: (superAdmin ? "admin" : user.role) as "admin" | "developer",
    superAdmin,
  };
}

export async function setAuthCookies(c: Context<AppEnv>, id: string, role: string) {
  const access = await signAccess(c.env, id, role);
  const refresh = await signRefresh(c.env, id, role);
  setCookie(c, ACCESS_COOKIE, access, cookieOpts(c.env, 15 * 60));
  setCookie(c, REFRESH_COOKIE, refresh, cookieOpts(c.env, 30 * 24 * 60 * 60));
}

export function clearAuthCookies(c: Context<AppEnv>) {
  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/" });
}

async function resolveUser(c: Context<AppEnv>): Promise<AuthUser | null> {
  const access = getCookie(c, ACCESS_COOKIE);
  const refresh = getCookie(c, REFRESH_COOKIE);
  if (access) {
    try {
      const p = await verifyToken(c.env, access);
      if (p.typ === "access") return { id: p.sub, role: p.role };
    } catch {
      // try refresh
    }
  }
  if (refresh) {
    try {
      const p = await verifyToken(c.env, refresh);
      if (p.typ === "refresh") return { id: p.sub, role: p.role };
    } catch {
      return null;
    }
  }
  return null;
}

async function ensureUser(c: Context<AppEnv>) {
  const user = await resolveUser(c);
  if (!user) throw new HttpError(401, ERROR_CODES.unauthorized, "Please sign in");
  if (!getCookie(c, ACCESS_COOKIE) && getCookie(c, REFRESH_COOKIE)) {
    const access = await signAccess(c.env, user.id, user.role);
    setCookie(c, ACCESS_COOKIE, access, cookieOpts(c.env, 15 * 60));
  }
  c.set("user", user);
  return user;
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  await ensureUser(c);
  await next();
}

async function loadDeveloper(c: Context<AppEnv>, id: string) {
  const rows = await getDb(c.env.DB).select().from(developers).where(eq(developers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const session = await ensureUser(c);
  const user = await loadDeveloper(c, session.id);
  if (!user) {
    throw new HttpError(401, ERROR_CODES.unauthorized, "Please sign in");
  }
  const presented = publicUser(user, c.env.SUPER_ADMIN_EMAIL);
  if (presented.role !== "admin") {
    throw new HttpError(403, ERROR_CODES.forbidden, "Admin only");
  }
  c.set("user", {
    id: user.id,
    role: presented.role,
    email: user.email,
    superAdmin: presented.superAdmin,
  });
  await next();
}

export async function requireSuperAdmin(c: Context<AppEnv>, next: Next) {
  if (!c.get("user")?.superAdmin) {
    throw new HttpError(403, ERROR_CODES.forbidden, "只有超级管理员可以管理管理员");
  }
  await next();
}

export function mustUser(c: Context<AppEnv>) {
  const user = c.get("user");
  if (!user) throw new HttpError(401, ERROR_CODES.unauthorized, "Please sign in");
  return user;
}
