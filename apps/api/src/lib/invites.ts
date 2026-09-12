import { and, eq, isNull } from "drizzle-orm";
import { inviteCodes, type InviteCode } from "@appunions/db/schema";
import { formatInviteCode, normalizeInviteCode } from "@appunions/shared";
import type { AppDb } from "@appunions/db";

type InviteDb = Pick<AppDb, "select" | "update">;

export async function findActiveInvite(db: InviteDb, raw?: string) {
  const code = raw ? normalizeInviteCode(raw) : null;
  if (!code) return null;
  const rows = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
  const row = rows[0];
  if (!row || row.usedAt || row.revokedAt) return null;
  return row;
}

export async function consumeInvite(db: InviteDb, invite: InviteCode, userId: string) {
  const [consumed] = await db
    .update(inviteCodes)
    .set({ usedAt: new Date(), usedBy: userId })
    .where(and(eq(inviteCodes.id, invite.id), isNull(inviteCodes.usedAt), isNull(inviteCodes.revokedAt)))
    .returning();
  return consumed ?? null;
}

export function inviteStatus(row: { usedAt: Date | null; revokedAt: Date | null }) {
  if (row.revokedAt) return "revoked" as const;
  if (row.usedAt) return "used" as const;
  return "unused" as const;
}

export function presentInviteCode(code: string) {
  return formatInviteCode(code);
}

export function isUniqueViolation(err: unknown) {
  let current = err;
  for (let i = 0; i < 4 && current && typeof current === "object"; i += 1) {
    if ("code" in current && (current as { code: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}
