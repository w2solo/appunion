import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
loadDotenv({ path: resolve(repoRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const client = postgres(databaseUrl, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: resolve(repoRoot, "packages/db/migrations") });
await client.end();
console.log("migrations applied");
