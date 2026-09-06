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

try {
  await migrate(drizzle(client), { migrationsFolder: resolve(repoRoot, "packages/db/migrations") });
  console.log("migrations applied");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (/already exists|duplicate key|relation .* already exists/i.test(message)) {
    console.error(
      "Existing Postgres data is from the previous 1Panel schema and cannot be auto-upgraded. On the server run: RESET_DB=1 bash deploy/install.sh",
    );
  }
  if (/password authentication failed/i.test(message)) {
    console.error(
      "POSTGRES_PASSWORD in deploy/.env does not match the existing data volume. Restore the old password or run: RESET_DB=1 bash deploy/install.sh",
    );
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
