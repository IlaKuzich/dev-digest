ALTER TABLE "skills" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;