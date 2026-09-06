import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema.js";

export type AppDb = PostgresJsDatabase<typeof schema>;
