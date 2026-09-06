import type { Env } from "./env.js";

export type AuthUser = {
  id: string;
  role: string;
  email?: string;
  superAdmin?: boolean;
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user?: AuthUser;
  };
};

export function flagEnabled(value: string | undefined) {
  return value === "true" || value === "1";
}

export function clientIp(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
}

export async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

export function routeParam(c: { req: { param: (name: string) => string | undefined } }, name: string) {
  const value = c.req.param(name);
  if (!value) throw new Error(`missing route param ${name}`);
  return value;
}
