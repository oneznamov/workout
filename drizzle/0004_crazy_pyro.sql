ALTER TABLE "workouts" ADD COLUMN "paused_sec" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "paused_at" timestamp with time zone;