import { z } from 'zod';

// ---- Project Context ----
// Discover Markdown docs under a repo's specs/docs/insights roots, let a user
// attach an ordered subset (paths only, never text) to an agent or skill, and
// at run time inject those docs' text into the existing `## Project context`
// prompt slot. See specs/2026-07-17-project-context.md.

export const ContextRoot = z.enum(['specs', 'docs', 'insights']);
export type ContextRoot = z.infer<typeof ContextRoot>;

export const ContextDoc = z.object({
  path: z.string(), // repo-relative
  root: ContextRoot,
  bytes: z.number().int(),
  token_estimate: z.number().int(),
  used_by_agents: z.number().int(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextDocsResponse = z.object({
  docs: z.array(ContextDoc),
  clone: z.object({
    synced_at: z.string().nullable(),
    present: z.boolean(),
  }),
});
export type ContextDocsResponse = z.infer<typeof ContextDocsResponse>;

export const ContextDocContent = z.object({
  path: z.string(),
  text: z.string(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;

// Owner (agent/skill) is implied by the route — not carried in the shape.
export const ContextAttachment = z.object({
  path: z.string(),
  order: z.number().int(),
  attached: z.boolean(),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;

// Full ordered set posted on save (mirrors `POST /agents/:id/skills`).
export const SetContextBody = z.object({
  docs: z.array(
    z.object({
      path: z.string(),
      attached: z.boolean(),
    }),
  ),
});
export type SetContextBody = z.infer<typeof SetContextBody>;
