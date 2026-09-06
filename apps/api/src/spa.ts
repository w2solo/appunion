import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import type { Hono } from "hono";
import type { AppEnv } from "./context.js";

const API_PREFIXES = ["/v1", "/dashboard", "/admin", "/media", "/internal"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

function isApiPath(path: string) {
  if (path === "/health") return true;
  return API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function attachSpa(app: Hono<AppEnv>, distDir: string) {
  const root = resolve(distDir);
  const indexFile = join(root, "index.html");
  if (!existsSync(indexFile)) {
    console.warn(`SPA dist not found at ${root}, skipping static hosting`);
    return;
  }

  app.get("*", async (c) => {
    if (isApiPath(c.req.path)) {
      return c.json({ error: { code: "not_found", message: "Not found" } }, 404);
    }
    const rel = c.req.path === "/" ? "/index.html" : c.req.path;
    const target = normalize(join(root, rel));
    if (target.startsWith(`${root}/`) || target === root) {
      if (existsSync(target) && statSync(target).isFile()) {
        const body = await readFile(target);
        return new Response(body, {
          headers: {
            "Content-Type": MIME[extname(target)] ?? "application/octet-stream",
            "Cache-Control": extname(target) === ".html" ? "no-cache" : "public, max-age=31536000",
          },
        });
      }
    }
    const html = await readFile(indexFile);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  });
}
