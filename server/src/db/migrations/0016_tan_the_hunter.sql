CREATE TABLE "memory_learning_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_run_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ci_run_id" uuid NOT NULL,
	"file" text NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"suggestion" text,
	"confidence" double precision NOT NULL,
	"kind" text DEFAULT 'finding' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory" ADD COLUMN "source" text DEFAULT 'explicit' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_synced_etag" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_title" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "memory_learning_state" ADD CONSTRAINT "memory_learning_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_run_findings" ADD CONSTRAINT "ci_run_findings_ci_run_id_ci_runs_id_fk" FOREIGN KEY ("ci_run_id") REFERENCES "public"."ci_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_id_repo_key" ON "ci_installations" USING btree ("agent_id","repo");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_github_url_key" ON "ci_runs" USING btree ("github_url");