import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@appunions/db/schema";
import type { AppDb } from "@appunions/db";

export function createDb(databaseUrl: string): { db: AppDb; client: Sql } {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema }) as AppDb;
  return { db, client };
}

export function getDb(db: AppDb): AppDb {
  return db;
}
