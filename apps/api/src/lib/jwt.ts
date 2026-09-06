import { SignJWT, jwtVerify } from "jose";
import { flagEnabled } from "../context.js";
import type { Env } from "../env.js";

export const ACCESS_COOKIE = "au_access";
export const REFRESH_COOKIE = "au_refresh";

export type TokenPayload = {
  sub: string;
  role: string;
  typ: "access" | "refresh";
};

function secret(env: Env) {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signAccess(env: Env, sub: string, role: string) {
  return new SignJWT({ role, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setExpirationTime("15m")
    .sign(secret(env));
}

export async function signRefresh(env: Env, sub: string, role: string) {
  return new SignJWT({ role, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setExpirationTime("30d")
    .sign(secret(env));
}

export async function verifyToken(env: Env, token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret(env));
  return {
    sub: String(payload.sub),
    role: String(payload.role),
    typ: payload.typ as "access" | "refresh",
  };
}

export function cookieOpts(env: Env, maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: flagEnabled(env.COOKIE_SECURE),
    path: "/",
    maxAge: maxAgeSec,
  };
}
