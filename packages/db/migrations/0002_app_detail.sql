ALTER TABLE "apps" ADD COLUMN "description" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "app_platforms" ADD COLUMN "download_stores" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "app_platforms" ADD COLUMN "extra_downloads" jsonb NOT NULL DEFAULT '[]'::jsonb;
