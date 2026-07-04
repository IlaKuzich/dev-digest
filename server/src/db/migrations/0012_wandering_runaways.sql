ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" numeric(12, 6);