import type { FastifyReply, FastifyRequest } from "fastify";
import { ERROR_CODES } from "@appunions/shared";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOpts,
  signAccess,
  signRefresh,
  verifyToken,
} from "../lib/jwt.js";
import { HttpError, sendError } from "../errors.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: { id: string; role: string };
  }
}

export async function setAuthCookies(reply: FastifyReply, id: string, role: string) {
  const access = await signAccess(id, role);
  const refresh = await signRefresh(id, role);
  reply.setCookie(ACCESS_COOKIE, access, cookieOpts(15 * 60));
  reply.setCookie(REFRESH_COOKIE, refresh, cookieOpts(30 * 24 * 60 * 60));
}

export function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: "/" });
}

async function resolveUser(request: FastifyRequest): Promise<{ id: string; role: string } | null> {
  const access = request.cookies[ACCESS_COOKIE];
  const refresh = request.cookies[REFRESH_COOKIE];
  if (access) {
    try {
      const p = await verifyToken(access);
      if (p.typ === "access") return { id: p.sub, role: p.role };
    } catch {
      // try refresh
    }
  }
  if (refresh) {
    try {
      const p = await verifyToken(refresh);
      if (p.typ === "refresh") return { id: p.sub, role: p.role };
    } catch {
      return null;
    }
  }
  return null;
}

export function requireUser() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await resolveUser(request);
    if (!user) {
      return sendError(reply, 401, ERROR_CODES.unauthorized, "Please sign in");
    }
    if (!request.cookies[ACCESS_COOKIE] && request.cookies[REFRESH_COOKIE]) {
      const access = await signAccess(user.id, user.role);
      reply.setCookie(ACCESS_COOKIE, access, cookieOpts(15 * 60));
    }
    request.authUser = user;
  };
}

export function requireAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireUser()(request, reply);
    if (reply.sent) return;
    if (request.authUser?.role !== "admin") {
      return sendError(reply, 403, ERROR_CODES.forbidden, "Admin only");
    }
  };
}

export function mustUser(request: FastifyRequest) {
  if (!request.authUser) throw new HttpError(401, ERROR_CODES.unauthorized, "Please sign in");
  return request.authUser;
}
