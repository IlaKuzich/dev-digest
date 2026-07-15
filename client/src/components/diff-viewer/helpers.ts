/** Pure helpers for the DiffViewer. */
import type { FindingRecord, Severity } from "@devdigest/shared";
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** Opt-in inline-findings overlay: every NEW-file line covered by an active
    finding's `[start_line, end_line]` range → the most severe finding's
    severity at that line. Overlapping ranges from different findings tie-break
    to the highest severity (CRITICAL > WARNING > SUGGESTION). Used to colour
    each `CodeLine`'s left border across a multi-line finding, not just its
    first line. */
export function highlightByLine(findings: FindingRecord[]): Map<number, Severity> {
  const map = new Map<number, Severity>();
  for (const f of findings) {
    for (let line = f.start_line; line <= f.end_line; line++) {
      const existing = map.get(line);
      if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing]) {
        map.set(line, f.severity);
      }
    }
  }
  return map;
}

/** Findings grouped by their anchor line (`start_line`) — each finding's
    clickable badge renders once, at the top of its highlighted range (a
    range can have >1 finding, e.g. two findings starting on the same line). */
export function findingsByStartLine(findings: FindingRecord[]): Map<number, FindingRecord[]> {
  const map = new Map<number, FindingRecord[]>();
  for (const f of findings) {
    const list = map.get(f.start_line) ?? [];
    list.push(f);
    map.set(f.start_line, list);
  }
  return map;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}
