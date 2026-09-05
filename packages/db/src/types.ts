import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./schema.js";

export type AppDb = DrizzleD1Database<typeof schema>;
