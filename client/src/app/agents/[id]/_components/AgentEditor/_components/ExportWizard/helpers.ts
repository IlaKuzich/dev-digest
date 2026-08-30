/* helpers.ts — pure helpers for the Export Wizard (no React import). */
import type { CiExportInputBody, CiFile, CiTarget } from "@devdigest/shared";
import type { PostAs } from "./types";

/** The runner bundle IS included in the server's `files[]` (it's still
 *  committed/zipped) but AC-10 requires it never appear in the Preview
 *  step's file selector — filtering is a client-side display concern.
 *  Path mirrors `server/src/modules/ci/generators/bundle.ts:116`. */
export const RUNNER_BUNDLE_PATH = ".devdigest/runner/index.js";

export function previewableFiles(files: CiFile[]): CiFile[] {
  return files.filter((f) => f.path !== RUNNER_BUNDLE_PATH);
}

/** The single editable file (workflow.yml) — identified by the `editable`
 *  flag the server already sets (AC-4), not a hardcoded path. */
export function editableFile(files: CiFile[]): CiFile | undefined {
  return files.find((f) => f.editable);
}

export interface ExportWizardState {
  target: CiTarget;
  repo: string;
  triggers: string[];
  postAs: PostAs;
  /** `undefined` = user has not edited workflow.yml — omit the override so
   *  the server commits its own freshly-generated copy (AC-14). */
  workflowYml: string | undefined;
}

/** Assembles the `CiExportInput` body (minus `action`, added by each hook)
 *  from the wizard's held state. */
export function buildExportInput(state: ExportWizardState): Omit<CiExportInputBody, "action"> {
  return {
    repo: state.repo,
    target: state.target,
    triggers: state.triggers,
    post_as: state.postAs,
    base: "main",
    ...(state.workflowYml !== undefined ? { workflow_yml: state.workflowYml } : {}),
  };
}

/** `ci.json`'s `exportWizard.postAs.*` keys are camelCase (`githubReview`,
 *  `prComment`, `none`) while the contract's `post_as` enum is snake_case
 *  (`github_review`, `pr_comment`, `none`) — this maps one to the other so
 *  the i18n lookup doesn't silently miss (next-intl logs, doesn't throw). */
export const POST_AS_I18N_KEY: Record<PostAs, string> = {
  github_review: "githubReview",
  pr_comment: "prComment",
  none: "none",
};

/** Dynamic hint shown under "Post results as" (AC-15) — literal copy, not an
 *  i18n key: `ci.json` is T2-owned/read-only for this task and carries no
 *  hint strings for this control (only the option labels). */
export function postAsHint(postAs: PostAs): string {
  switch (postAs) {
    case "github_review":
      return "Posts as a GitHub review (approve or request changes) using GITHUB_TOKEN.";
    case "pr_comment":
      return "Posts a single PR comment summarizing the findings — no review state is set.";
    case "none":
      return "No PR feedback is posted — check the workflow run's exit code and logs instead.";
    default:
      return "";
  }
}

/** Extracts a readable message from a React Query mutation error. */
export function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Something went wrong.";
}
