import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
export const ACCESS_COOKIE = "au_access";
export const REFRESH_COOKIE = "au_refresh";

export type TokenPayload = {
  sub: string;
  role: string;
  typ: "access" | "refresh";
};

export async function signAccess(sub: string, role: string) {
  return new SignJWT({ role, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setExpirationTime("15m")
    .sign(secret);
}

export async function signRefresh(sub: string, role: string) {
  return new SignJWT({ role, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: String(payload.sub),
    role: String(payload.role),
    typ: payload.typ as "access" | "refresh",
  };
}

export function cookieOpts(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: maxAgeSec,
  };
}
