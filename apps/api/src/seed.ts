import { eq } from "drizzle-orm";
import { categories, developers, platformConfig } from "@appunions/db/schema";
import { DEFAULT_CATEGORY_TREE } from "@appunions/shared";
import type { AppDb } from "@appunions/db";

async function seedDefaultCategories(db: AppDb) {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing[0]) return;
  for (const group of DEFAULT_CATEGORY_TREE) {
    const [parent] = await db.insert(categories).values({ name: group.name }).returning();
    if (!parent || group.children.length === 0) continue;
    await db.insert(categories).values(group.children.map((name) => ({ name, parentId: parent.id })));
  }
}

export async function seed(db: AppDb, superAdminEmail?: string) {
  const cfg = await db.select().from(platformConfig).limit(1);
  if (!cfg[0]) {
    await db.insert(platformConfig).values({ id: 1 });
  }

  await seedDefaultCategories(db);

  const email = superAdminEmail?.trim().toLowerCase();
  if (!email) return;

  const existing = await db.select().from(developers).where(eq(developers.email, email)).limit(1);
  if (!existing[0]) {
    await db.insert(developers).values({
      email,
      passwordHash: "otp",
      role: "admin",
    });
    console.log(`seeded super admin ${email}`);
  } else if (existing[0].role !== "admin") {
    await db.update(developers).set({ role: "admin" }).where(eq(developers.id, existing[0].id));
  }
}
