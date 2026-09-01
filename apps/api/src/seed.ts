import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { developers, platformConfig } from "@appunions/db/schema";
import { db } from "./db.js";
import { env } from "./env.js";

export async function seed() {
  const existing = await db
    .select()
    .from(developers)
    .where(eq(developers.email, env.ADMIN_EMAIL))
    .limit(1);
  if (!existing[0]) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    await db.insert(developers).values({
      email: env.ADMIN_EMAIL,
      passwordHash,
      role: "admin",
    });
    console.log(`seeded admin ${env.ADMIN_EMAIL}`);
  }
  const cfg = await db.select().from(platformConfig).limit(1);
  if (!cfg[0]) {
    await db.insert(platformConfig).values({ id: 1 });
  }
}
