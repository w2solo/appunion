import type { Context } from "hono";
import { ERROR_CODES, type ErrorCode } from "@appunions/shared";
import type { AppEnv } from "./context.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  console.error(err);
  return {
    status: 500 as const,
    body: { error: { code: ERROR_CODES.internal_error, message: "Internal error" } },
  };
}
