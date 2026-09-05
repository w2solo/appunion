import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  API_PORT: z.coerce.number().default(3000),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_PUBLIC_URL: z.string().url(),
  SENDCLOUD_API_USER: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SENDCLOUD_API_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SENDCLOUD_FROM: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SENDCLOUD_FROM_NAME: z.string().default("AppUnions"),
  AUTH_ECHO_CODE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export const env = schema.parse(process.env);
