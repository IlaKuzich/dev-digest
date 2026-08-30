/* types.ts — shared types for ExportWizard + its step components. Kept in a
   separate file (not exported from ExportWizard.tsx) so the step components
   can import them without a circular import back into the shell that renders
   them — same pattern as client INSIGHTS.md 2026-06-29 (findings-severity-
   badges' TopFinding in its own types.ts). */

export type PostAs = "github_review" | "pr_comment" | "none";

export type InstallMode = "open_pr" | "files";
