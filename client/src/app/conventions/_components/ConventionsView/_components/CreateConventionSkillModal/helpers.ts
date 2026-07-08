import type { ConventionCandidate } from "@devdigest/shared";

/**
 * Client mirror of the server's `mergeConventionsToSkillBody` so the modal's
 * default body preview matches exactly what a server-side merge would produce.
 */
export function buildDefaultSkillBody(
  repoName: string,
  accepted: ConventionCandidate[],
): string {
  const header = `# ${repoName}-conventions\n\nHouse conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = accepted.map((c) => {
    const rule = c.edited_rule ?? c.rule;
    const range =
      c.evidence_line_start != null
        ? `${c.evidence_path}:${c.evidence_line_start}${c.evidence_line_end != null ? `-${c.evidence_line_end}` : ""}`
        : c.evidence_path;
    const slug = c.category ?? "convention";
    return `## ${slug}\n${rule}\n\nDetected in \`${range}\`:\n\n\`\`\`\n${c.evidence_snippet}\n\`\`\``;
  });
  return [header, ...sections].join("\n\n");
}

/** Slug used as the default skill name/description subject. */
export function repoSlug(repoName: string): string {
  const last = repoName.split("/").pop() ?? repoName;
  return last.trim();
}
