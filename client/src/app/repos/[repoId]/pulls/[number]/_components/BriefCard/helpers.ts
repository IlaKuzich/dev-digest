/** Pure helpers for BriefCard — kept out of JSX per team convention. */

/** Parses a Brief `file_ref` like "src/config.ts:12", "package.json:34-40" or
   plain "src/api/users.ts" into a navigable file + optional starting line. */
export function parseFileRef(ref: string): { file: string; line: number | null } {
  const idx = ref.lastIndexOf(":");
  if (idx === -1) return { file: ref, line: null };
  const suffix = ref.slice(idx + 1);
  const match = /^(\d+)(?:-\d+)?$/.exec(suffix);
  if (!match) return { file: ref, line: null };
  return { file: ref.slice(0, idx), line: Number(match[1]) };
}

/** Builds the `?tab=diff&file=<path>&line=<n>` URL shape already written
   (unused, until now) by SymbolList.tsx, for consistent deep-link navigation
   into the "Files changed" tab. */
export function buildFileRefUrl(
  repoId: string,
  prNumber: string,
  ref: string,
): string {
  const { file, line } = parseFileRef(ref);
  const q = new URLSearchParams();
  q.set("tab", "diff");
  q.set("file", file);
  if (line != null) q.set("line", String(line));
  return `/repos/${repoId}/pulls/${prNumber}?${q.toString()}`;
}

/** Compact token count, e.g. 8200 -> "8.2K". */
export function formatTokens(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
