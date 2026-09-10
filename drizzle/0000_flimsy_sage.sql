CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_request" timestamp with time zone DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	"busy_until" timestamp with time zone DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_chat_sessions_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_owner_updated_idx" ON "conversations" USING btree ("owner","updated_at");