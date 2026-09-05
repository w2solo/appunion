import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { apps, categories, type Category } from "./schema.js";

export type CategoryNode = Category & { children: Category[] };

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isUniqueViolation(err: unknown) {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if ("code" in current && (current as { code: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

export async function listCategoryTree(db: PostgresJsDatabase<any>): Promise<CategoryNode[]> {
  const rows = await db.select().from(categories);
  const roots = rows.filter((row) => !row.parentId).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const children = rows.filter((row) => row.parentId);
  return roots.map((root) => ({
    ...root,
    children: children
      .filter((child) => child.parentId === root.id)
      .sort((a, b) => a.name.localeCompare(b.name, "zh")),
  }));
}

async function findRoot(db: PostgresJsDatabase<any>, name: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(isNull(categories.parentId), sql`lower(${categories.name}) = ${name.toLowerCase()}`))
    .limit(1);
  return rows[0] ?? null;
}

async function findChild(db: PostgresJsDatabase<any>, parentId: string, name: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.parentId, parentId), sql`lower(${categories.name}) = ${name.toLowerCase()}`))
    .limit(1);
  return rows[0] ?? null;
}

async function insertRoot(db: PostgresJsDatabase<any>, name: string) {
  try {
    const [row] = await db.insert(categories).values({ name }).returning();
    return row!;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await findRoot(db, name);
    if (!again) throw err;
    return again;
  }
}

async function insertChild(db: PostgresJsDatabase<any>, parentId: string, name: string) {
  try {
    const [row] = await db.insert(categories).values({ name, parentId }).returning();
    return row!;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await findChild(db, parentId, name);
    if (!again) throw err;
    return again;
  }
}

export async function upsertCategoryPair(
  db: PostgresJsDatabase<any>,
  parentRaw: string,
  childRaw: string,
): Promise<{ category: string; subcategory: string }> {
  const parentName = normalize(parentRaw);
  const childName = normalize(childRaw);
  if (!parentName || !childName) throw new Error("invalid_category");
  const parent = (await findRoot(db, parentName)) ?? (await insertRoot(db, parentName));
  const child = (await findChild(db, parent.id, childName)) ?? (await insertChild(db, parent.id, childName));
  return { category: parent.name, subcategory: child.name };
}

export async function renameCategory(db: PostgresJsDatabase<any>, id: string, rawName: string) {
  const name = normalize(rawName);
  if (!name) throw new Error("invalid_category");
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.name === name) return row;
  const clash = row.parentId ? await findChild(db, row.parentId, name) : await findRoot(db, name);
  if (clash && clash.id !== id) throw new Error("duplicate_category");
  const [updated] = await db.update(categories).set({ name }).where(eq(categories.id, id)).returning();
  if (row.parentId) {
    const parent = (await db.select().from(categories).where(eq(categories.id, row.parentId)).limit(1))[0];
    if (parent) {
      await db
        .update(apps)
        .set({ subcategory: name })
        .where(and(eq(apps.category, parent.name), eq(apps.subcategory, row.name)));
    }
  } else {
    await db.update(apps).set({ category: name }).where(eq(apps.category, row.name));
  }
  return updated!;
}

export async function createCategory(db: PostgresJsDatabase<any>, rawName: string, parentId: string | null) {
  const name = normalize(rawName);
  if (!name) throw new Error("invalid_category");
  if (parentId) {
    const parent = (await db.select().from(categories).where(eq(categories.id, parentId)).limit(1))[0];
    if (!parent || parent.parentId) throw new Error("invalid_parent");
    if (await findChild(db, parentId, name)) throw new Error("duplicate_category");
    const [row] = await db.insert(categories).values({ name, parentId }).returning();
    return row!;
  }
  if (await findRoot(db, name)) throw new Error("duplicate_category");
  const [row] = await db.insert(categories).values({ name }).returning();
  return row!;
}

export async function deleteCategory(db: PostgresJsDatabase<any>, id: string) {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  const row = rows[0];
  if (!row) return "missing" as const;
  if (!row.parentId) {
    const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id)).limit(1);
    if (kids[0]) return "has_children" as const;
    const used = await db.select({ id: apps.id }).from(apps).where(eq(apps.category, row.name)).limit(1);
    if (used[0]) return "in_use" as const;
  } else {
    const parent = (await db.select().from(categories).where(eq(categories.id, row.parentId)).limit(1))[0];
    if (parent) {
      const used = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.category, parent.name), eq(apps.subcategory, row.name)))
        .limit(1);
      if (used[0]) return "in_use" as const;
    }
  }
  await db.delete(categories).where(eq(categories.id, id));
  return "ok" as const;
}

export async function categoryUsage(db: PostgresJsDatabase<any>, tree: CategoryNode[]) {
  const counts = await db
    .select({
      category: apps.category,
      subcategory: apps.subcategory,
      count: sql<number>`count(*)::int`,
    })
    .from(apps)
    .groupBy(apps.category, apps.subcategory);
  const map = new Map<string, number>();
  for (const row of counts) {
    map.set(`${row.category}\0${row.subcategory}`, row.count);
    map.set(row.category, (map.get(row.category) ?? 0) + row.count);
  }
  return tree.map((root) => ({
    id: root.id,
    name: root.name,
    appCount: map.get(root.name) ?? 0,
    children: root.children.map((child) => ({
      id: child.id,
      name: child.name,
      appCount: map.get(`${root.name}\0${child.name}`) ?? 0,
    })),
  }));
}
