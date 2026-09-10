CREATE TABLE "health_settings" (
	"id" varchar(20) PRIMARY KEY DEFAULT 'global' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule" varchar(100) DEFAULT '*/5 * * * *' NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"concurrency" integer DEFAULT 5 NOT NULL,
	"retries" integer DEFAULT 2 NOT NULL,
	"retry_delay_ms" integer DEFAULT 250 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
