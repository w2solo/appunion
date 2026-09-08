ALTER TABLE "platform_config" ADD COLUMN "union_name" text NOT NULL DEFAULT '应用互推联盟';
--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "union_subtitle" text NOT NULL DEFAULT '发现更多好用的 App';
--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "union_logo_url" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "rate_info_per_min" integer NOT NULL DEFAULT 120;
