import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { now } from "./_shared";
import { workspaces } from "./core";
import { repos } from "./repos";

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  repoId: uuid("repo_id")
    .references(() => repos.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type", {
    enum: ["rubric", "convention", "security", "custom"],
  }).notNull(),
  source: text("source", {
    enum: ["manual", "imported_url", "extracted", "community"],
  }).notNull(),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  evidenceFiles: jsonb("evidence_files").$type<string[]>(),
  threatLevel: text("threat_level", {
    enum: ["unknown", "safe", "suspicious", "dangerous"],
  })
    .notNull()
    .default("unknown"),
  // Ordered list of project-context doc paths (relative to clone root) attached
  // to this skill. When a skill is linked to an agent, these paths are merged
  // into the agent's context doc list at run time (agent paths first).
  contextDocPaths: text("context_doc_paths")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  createdAt: now(),
});

export const skillVersions = pgTable(
  "skill_versions",
  {
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
