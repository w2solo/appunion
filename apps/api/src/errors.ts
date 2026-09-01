import type { FastifyReply } from "fastify";
import { ERROR_CODES, type ErrorCode } from "@appunions/shared";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(reply: FastifyReply, status: number, code: ErrorCode, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

export function httpErrorHandler(err: unknown, reply: FastifyReply) {
  if (err instanceof HttpError) {
    return sendError(reply, err.status, err.code, err.message);
  }
  console.error(err);
  return sendError(reply, 500, ERROR_CODES.internal_error, "Internal error");
}
