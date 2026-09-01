import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@appunions/db/schema";
import { env } from "./env.js";

export const sql = postgres(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
