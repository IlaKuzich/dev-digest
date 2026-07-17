import type { ConventionCandidate, ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

/** Collapse all whitespace runs to a single space and trim. */
export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Moderate grounding: does `snippet` appear ANYWHERE in `fileContent`
 * (whitespace-normalized)? Returns the 1-based line range of the first match, or
 * null (→ drop the candidate).
 */
export function locateEvidence(
  fileContent: string,
  snippet: string,
): { startLine: number; endLine: number } | null {
  const normSnippet = normalizeWs(snippet);
  if (normSnippet.length === 0) return null;
  if (!normalizeWs(fileContent).includes(normSnippet)) return null;

  const lines = fileContent.split(/\r?\n/);
  const snippetLines = snippet.split(/\r?\n/).map(normalizeWs).filter(Boolean);
  const firstSnippetLine = snippetLines[0]!;
  const spanCount = Math.max(snippetLines.length, 1);

  let startLine = 1;
  for (let i = 0; i < lines.length; i += 1) {
    const nl = normalizeWs(lines[i]!);
    if (nl.length > 0 && (nl.includes(firstSnippetLine) || firstSnippetLine.includes(nl))) {
      startLine = i + 1;
      break;
    }
  }
  const endLine = Math.min(startLine + spanCount - 1, lines.length);
  return { startLine, endLine };
}

/** Map a persisted row to the public DTO. `confidence` is doublePrecision → already a number. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    scan_id: row.scanId ?? null,
    category: (row.category ?? 'structure') as ConventionCategory,
    rule: row.rule,
    edited_rule: row.editedRule ?? null,
    evidence_path: row.evidencePath ?? '',
    evidence_line_start: row.evidenceLineStart ?? null,
    evidence_line_end: row.evidenceLineEnd ?? null,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    skill_id: row.skillId ?? null,
    created_at: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

/** Merge accepted conventions into one markdown skill body (matches the create-skill modal preview). */
export function mergeConventionsToSkillBody(
  repoName: string,
  accepted: ConventionCandidate[],
): string {
  const header = `# ${repoName}-conventions\n\nHouse conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = accepted.map((c) => {
    const rule = c.edited_rule ?? c.rule;
    const range =
      c.evidence_line_start != null
        ? `${c.evidence_path}:${c.evidence_line_start}${c.evidence_line_end != null ? `-${c.evidence_line_end}` : ''}`
        : c.evidence_path;
    const slug = c.category ?? 'convention';
    return `## ${slug}\n${rule}\n\nDetected in \`${range}\`:\n\n\`\`\`\n${c.evidence_snippet}\n\`\`\``;
  });
  return [header, ...sections].join('\n\n');
}
