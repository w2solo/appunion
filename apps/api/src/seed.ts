import { eq } from "drizzle-orm";
import { categories, developers, platformConfig } from "@appunions/db/schema";
import { DEFAULT_CATEGORY_TREE, SUPER_ADMIN_EMAIL } from "@appunions/shared";
import { db } from "./db.js";

async function seedDefaultCategories() {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing[0]) return;
  for (const group of DEFAULT_CATEGORY_TREE) {
    const [parent] = await db.insert(categories).values({ name: group.name }).returning();
    if (!parent || group.children.length === 0) continue;
    await db.insert(categories).values(group.children.map((name) => ({ name, parentId: parent.id })));
  }
}

export async function seed() {
  const cfg = await db.select().from(platformConfig).limit(1);
  if (!cfg[0]) {
    await db.insert(platformConfig).values({ id: 1 });
  }

  await seedDefaultCategories();

  const existing = await db
    .select()
    .from(developers)
    .where(eq(developers.email, SUPER_ADMIN_EMAIL))
    .limit(1);
  if (!existing[0]) {
    await db.insert(developers).values({
      email: SUPER_ADMIN_EMAIL,
      passwordHash: "otp",
      role: "admin",
    });
    console.log(`seeded super admin ${SUPER_ADMIN_EMAIL}`);
  } else if (existing[0].role !== "admin") {
    await db.update(developers).set({ role: "admin" }).where(eq(developers.id, existing[0].id));
  }
}
