import type { FindingRecord } from "@devdigest/shared";

export type TopFinding = {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale_snippet: string;
};

export function toTopFinding(f: FindingRecord): TopFinding {
  const snippet =
    f.rationale.length > 120
      ? f.rationale.slice(0, 120).replace(/\s\S+$/, "") + "…"
      : f.rationale;
  return {
    id:                f.id,
    severity:          f.severity,
    category:          f.category,
    title:             f.title,
    file:              f.file,
    start_line:        f.start_line,
    end_line:          f.end_line,
    confidence:        f.confidence,
    rationale_snippet: snippet,
  };
}
