import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await sql`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`;
const applied = await sql<{ id: string }[]>`select id from schema_migrations`;
const done = new Set(applied.map((r) => r.id));

for (const file of files) {
  if (done.has(file)) continue;
  const body = fs.readFileSync(path.join(dir, file), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into schema_migrations (id) values (${file})`;
  });
  console.log(`applied ${file}`);
}

await sql.end();
console.log("migrations complete");
