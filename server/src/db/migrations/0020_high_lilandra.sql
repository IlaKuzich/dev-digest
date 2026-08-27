CREATE TABLE "multi_agent_run_agents" (
	"multi_agent_run_id" uuid NOT NULL,
	"agent_run_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "multi_agent_run_agents" ADD CONSTRAINT "multi_agent_run_agents_multi_agent_run_id_multi_agent_runs_id_fk" FOREIGN KEY ("multi_agent_run_id") REFERENCES "public"."multi_agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_agent_run_agents" ADD CONSTRAINT "multi_agent_run_agents_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "multi_agent_run_agents_multi_agent_run_id_idx" ON "multi_agent_run_agents" USING btree ("multi_agent_run_id");