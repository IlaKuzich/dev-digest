/**
 * Shared utilities for context-doc components.
 * Both ContextDocList and ContextDocAttachList classify documents and apply
 * badge colors from the same logic — extract here to keep them in sync.
 */

export type DocType = "spec" | "doc" | "insight" | "readme";

/**
 * Map a doc path to a canonical DocType by its containing folder.
 * Paths are package-scoped (e.g. "client/specs/pages.md",
 * "e2e/docs/flows.md"), so the specs/docs/insights folder can appear at any
 * depth — checking only a root-level prefix misses every real path.
 * Paths without a recognized segment (root .md files, module READMEs) get "readme".
 */
export function getDocType(path: string): DocType {
  const segments = path.split("/");
  if (segments.includes("specs")) return "spec";
  if (segments.includes("docs")) return "doc";
  if (segments.includes("insights")) return "insight";
  return "readme";
}

/** CSS-variable colors for each DocType badge. */
export const BADGE_COLORS: Record<DocType, string> = {
  spec: "var(--accent)",
  doc: "var(--ok)",
  insight: "var(--warn)",
  readme: "var(--info)",
};

/**
 * Maps DocType to the i18n key suffix used by ContextDocAttachList
 * (e.g. t("attach.badgeSpec")).
 */
export const DOC_TYPE_I18N: Record<
  DocType,
  "badgeSpec" | "badgeDoc" | "badgeInsight" | "badgeReadme"
> = {
  spec: "badgeSpec",
  doc: "badgeDoc",
  insight: "badgeInsight",
  readme: "badgeReadme",
};
