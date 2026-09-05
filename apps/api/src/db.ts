import { drizzle } from "drizzle-orm/d1";
import * as schema from "@appunions/db/schema";
import type { AppDb } from "@appunions/db";

export function getDb(d1: D1Database): AppDb {
  return drizzle(d1, { schema }) as AppDb;
}
