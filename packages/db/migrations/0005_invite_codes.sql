CREATE TABLE "invite_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_by" text NOT NULL REFERENCES "developers"("id"),
  "used_by" text REFERENCES "developers"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "used_at" timestamptz,
  "revoked_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_code_uidx" ON "invite_codes" ("code");
--> statement-breakpoint
CREATE INDEX "invite_codes_created_by_idx" ON "invite_codes" ("created_by");
