CREATE TABLE "ai_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"content" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai" jsonb;--> statement-breakpoint
ALTER TABLE "ai_notes" ADD CONSTRAINT "ai_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_notes_ref" ON "ai_notes" USING btree ("user_id","kind","ref");