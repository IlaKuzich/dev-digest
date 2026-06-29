# Findings Severity Counter & Tooltip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-severity findings counter with a hover tooltip to the PR list table, the Timeline's RunHistory rows, and the Review Runs accordion header.

**Architecture:** Shared `FindingsSeverityBadges` + `FindingsTooltip` components live in `client/src/components/findings-severity-badges/`. The server populates two new nullable fields (`findings_by_severity`, `top_findings`) in `GET /repos/:id/pulls` via an extra IN-query over the existing `findings`+`reviews` tables (no migration). Client integration points consume these components at three surfaces.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript 5.7 · Zod 3 · Drizzle ORM 0.38 · `@devdigest/ui` primitives · vitest 2 + React Testing Library 16 + jsdom 25

## Global Constraints

- Both `server/src/vendor/shared/contracts/platform.ts` and `client/src/vendor/shared/contracts/platform.ts` **must be updated in the same commit** — the project has no automated sync; drifting one side causes Zod parse failures at runtime.
- No new DB migrations — query reads existing `findings` and `reviews` tables.
- Do NOT add `isNull` from drizzle-orm twice — add it to the existing import line.
- All imports of `@devdigest/ui` primitives go through the public barrel; never import from `src/vendor/ui/` internals.
- Client tests: vitest 2 + jsdom 25; test files live adjacent to the component (`*.test.tsx`). Run with `pnpm test` inside `client/`.
- Server tests: none required (query follows the existing `latestCostByPr` pattern, already covered indirectly).
- `GRID` and `COLUMN_KEYS` in `constants.ts` must stay in sync — the header row renders COLUMN_KEYS.length cells against the same GRID template used by PRRow.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/vendor/shared/contracts/platform.ts` | Modify | Add `findings_by_severity`, `top_findings` to `PrMeta` Zod schema |
| `client/src/vendor/shared/contracts/platform.ts` | Modify | Identical Zod change (vendored copy — must match exactly) |
| `server/src/modules/pulls/routes.ts` | Modify | Add findings IN-query; populate new fields in the mapped response |
| `client/src/components/findings-severity-badges/FindingsSeverityBadges.tsx` | Create | Inline pill row; renders "—" when empty |
| `client/src/components/findings-severity-badges/FindingsTooltip.tsx` | Create | Hover tooltip wrapper around `FindingsSeverityBadges` |
| `client/src/components/findings-severity-badges/index.ts` | Create | Barrel: `FindingsSeverityBadges`, `FindingsTooltip`, `TopFinding`, `toTopFinding` |
| `client/src/components/findings-severity-badges/FindingsSeverityBadges.test.tsx` | Create | Unit tests: null/zero → "—"; non-zero pills; hides zero-count severities |
| `client/src/components/findings-severity-badges/FindingsTooltip.test.tsx` | Create | Unit tests: renders finding rows when hovered; no-op when empty |
| `client/src/app/repos/[repoId]/pulls/constants.ts` | Modify | Add `"findings"` to `COLUMN_KEYS`; update `GRID` template |
| `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` | Modify | Add findings column cell |
| `client/messages/en/prReview.json` | Modify | Add `list.columns.findings` key |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx` | Modify | Add `reviews?` prop; replace findings/blockers text with `FindingsTooltip` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx` | Modify | Pass `reviews={runs}` to `<RunHistory>` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` | Modify | Replace text span with `FindingsTooltip` + blocker count |

---

## Task 1: Extend `PrMeta` in both vendored contract copies

**Files:**
- Modify: `server/src/vendor/shared/contracts/platform.ts` (around line 157)
- Modify: `client/src/vendor/shared/contracts/platform.ts` (around line 157)

**Interfaces:**
- Produces: `PrMeta.findings_by_severity` and `PrMeta.top_findings` — consumed by server (Task 2) and client components (Tasks 4–6).

- [ ] **Step 1: Edit `server/src/vendor/shared/contracts/platform.ts`**

Find the `PrMeta` schema (currently ends at `latest_run_cost_usd`). Add two new nullable fields:

```ts
export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  score: z.number().int().nullish(),
  latest_run_cost_usd: z.number().nullish(),
  findings_by_severity: z.object({
    CRITICAL:   z.number().int(),
    WARNING:    z.number().int(),
    SUGGESTION: z.number().int(),
  }).nullable().optional(),
  top_findings: z.array(z.object({
    id:               z.string(),
    severity:         z.string(),
    category:         z.string(),
    title:            z.string(),
    file:             z.string(),
    start_line:       z.number().int(),
    end_line:         z.number().int(),
    confidence:       z.number(),
    rationale_snippet: z.string(),
  })).nullable().optional(),
});
```

- [ ] **Step 2: Apply the identical change to `client/src/vendor/shared/contracts/platform.ts`**

The `PrMeta` schema in the client vendored copy is at the same location. Replace the `PrMeta` object body with the same schema shown in Step 1. The two files must be byte-for-byte identical in the `PrMeta` block.

- [ ] **Step 3: Typecheck both packages**

```bash
cd server && pnpm typecheck
cd ../client && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts
git commit -m "feat(contracts): add findings_by_severity + top_findings to PrMeta"
```

---

## Task 2: Server — populate new fields in `GET /repos/:id/pulls`

**Files:**
- Modify: `server/src/modules/pulls/routes.ts`

**Interfaces:**
- Consumes: `t.findings`, `t.reviews` (existing Drizzle tables from `src/db/schema.ts`), `PrMeta.findings_by_severity` + `PrMeta.top_findings` from Task 1.
- Produces: populated `findings_by_severity` and `top_findings` in the JSON response for every PR row.

- [ ] **Step 1: Add `isNull` to the drizzle-orm import**

The file currently imports:
```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
```

Change it to:
```ts
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
```

- [ ] **Step 2: Add a `snippetOf` helper before the route handler**

Add this pure function immediately above the `export default async function pullsRoutes` line:

```ts
function snippetOf(rationale: string): string {
  if (rationale.length <= 120) return rationale;
  return rationale.slice(0, 120).replace(/\s\S+$/, '') + '…';
}
```

- [ ] **Step 3: Add the findings query block inside the route handler**

Inside `app.get('/repos/:id/pulls', ...)`, after the `latestCostByPr` block (which ends around line 150), add:

```ts
// findings_by_severity + top_findings: all non-dismissed findings per PR.
// Same IN-query + JS-grouping pattern as latestCostByPr.
type SevKey = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
const SEV_ORDER: Record<SevKey, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
type TopFinding = {
  id: string; severity: string; category: string; title: string;
  file: string; start_line: number; end_line: number; confidence: number;
  rationale_snippet: string;
};
type FindingsBucket = {
  bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  top: TopFinding[];
};
const findingsByPr = new Map<string, FindingsBucket>();

if (prIds.length > 0) {
  const fRows = await container.db
    .select({
      prId:       t.reviews.prId,
      id:         t.findings.id,
      severity:   t.findings.severity,
      category:   t.findings.category,
      title:      t.findings.title,
      file:       t.findings.file,
      startLine:  t.findings.startLine,
      endLine:    t.findings.endLine,
      confidence: t.findings.confidence,
      rationale:  t.findings.rationale,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
    .where(and(
      inArray(t.reviews.prId, prIds),
      isNull(t.findings.dismissedAt),
    ));

  for (const row of fRows) {
    if (!findingsByPr.has(row.prId)) {
      findingsByPr.set(row.prId, {
        bySeverity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
        top: [],
      });
    }
    const bucket = findingsByPr.get(row.prId)!;
    const sev = row.severity as SevKey;
    if (sev in bucket.bySeverity) bucket.bySeverity[sev]++;
    bucket.top.push({
      id:               row.id,
      severity:         row.severity,
      category:         row.category,
      title:            row.title,
      file:             row.file,
      start_line:       row.startLine,
      end_line:         row.endLine,
      confidence:       row.confidence,
      rationale_snippet: snippetOf(row.rationale),
    });
  }

  // Sort each bucket: CRITICAL → WARNING → SUGGESTION, then confidence DESC.
  // Trim to top 6 per PR.
  for (const bucket of findingsByPr.values()) {
    bucket.top.sort((a, b) => {
      const sevDiff =
        (SEV_ORDER[a.severity as SevKey] ?? 3) -
        (SEV_ORDER[b.severity as SevKey] ?? 3);
      return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
    });
    bucket.top = bucket.top.slice(0, 6);
  }
}
```

- [ ] **Step 4: Add the new fields to the mapped return**

Inside the `return rows.map((r) => { ... })` at the end of the route, add two new fields after `latest_run_cost_usd`:

```ts
findings_by_severity: findingsByPr.get(r.id)?.bySeverity ?? null,
top_findings:         findingsByPr.get(r.id)?.top ?? null,
```

The full return shape becomes:
```ts
return rows.map((r) => {
  const review = latestReviewByPr.get(r.id);
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: deriveReviewStatus({
      ghStatus: r.status,
      lastReviewedSha: r.lastReviewedSha,
      headSha: r.headSha,
      updatedAt: r.updatedAt,
      now,
    }),
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    score: review ? review.score : null,
    latest_run_cost_usd: latestCostByPr.get(r.id) ?? null,
    findings_by_severity: findingsByPr.get(r.id)?.bySeverity ?? null,
    top_findings:         findingsByPr.get(r.id)?.top ?? null,
  };
});
```

- [ ] **Step 5: Typecheck the server**

```bash
cd server && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Smoke test the route (optional, if server is running)**

```bash
curl -s http://localhost:3001/repos/<any-repo-id>/pulls | jq '.[0] | {findings_by_severity, top_findings}'
```

Expected: either `{"findings_by_severity": {"CRITICAL": 2, ...}, "top_findings": [...]}` or both null if no findings exist.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/pulls/routes.ts
git commit -m "feat(server): populate findings_by_severity + top_findings in pulls list"
```

---

## Task 3: Create `FindingsSeverityBadges`, `FindingsTooltip`, and `toTopFinding`

**Files:**
- Create: `client/src/components/findings-severity-badges/FindingsSeverityBadges.tsx`
- Create: `client/src/components/findings-severity-badges/FindingsTooltip.tsx`
- Create: `client/src/components/findings-severity-badges/index.ts`
- Create: `client/src/components/findings-severity-badges/FindingsSeverityBadges.test.tsx`
- Create: `client/src/components/findings-severity-badges/FindingsTooltip.test.tsx`

**Interfaces:**
- Consumes: `SeverityBadge`, `CategoryTag`, `MonoLink`, `ConfidenceNum`, `type Severity`, `type Category` from `@devdigest/ui`; `githubBlobUrl` from `@/lib/github-urls`; `FindingRecord` from `@devdigest/shared`.
- Produces: `FindingsSeverityBadges`, `FindingsTooltip`, `TopFinding` (type), `toTopFinding` — all consumed by Tasks 4–6.

- [ ] **Step 1: Write the failing tests for `FindingsSeverityBadges`**

Create `client/src/components/findings-severity-badges/FindingsSeverityBadges.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FindingsSeverityBadges } from "./FindingsSeverityBadges";

afterEach(cleanup);

describe("FindingsSeverityBadges", () => {
  it("renders '—' when bySeverity is null", () => {
    render(<FindingsSeverityBadges bySeverity={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders '—' when all counts are 0", () => {
    render(<FindingsSeverityBadges bySeverity={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders only the non-zero severity count", () => {
    render(<FindingsSeverityBadges bySeverity={{ CRITICAL: 3, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    // WARNING and SUGGESTION pills must be absent (no "0" from them)
    const nums = screen.queryAllByText("0");
    expect(nums).toHaveLength(0);
  });

  it("renders multiple non-zero severities", () => {
    render(<FindingsSeverityBadges bySeverity={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryAllByText("0")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd client && pnpm test --run src/components/findings-severity-badges/FindingsSeverityBadges.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write failing tests for `FindingsTooltip` and `toTopFinding`**

Create `client/src/components/findings-severity-badges/FindingsTooltip.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FindingsTooltip, toTopFinding } from "./index";
import type { TopFinding } from "./index";
import type { FindingRecord } from "@devdigest/shared";

afterEach(cleanup);

function makeFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "CRITICAL",
    category: "bug",
    title: "SQL injection",
    file: "server.ts",
    start_line: 10,
    end_line: 12,
    rationale: "User input is passed directly to the query.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("toTopFinding", () => {
  it("copies all required fields", () => {
    const f = makeFinding();
    const top = toTopFinding(f);
    expect(top.id).toBe("f1");
    expect(top.severity).toBe("CRITICAL");
    expect(top.title).toBe("SQL injection");
    expect(top.confidence).toBe(0.95);
  });

  it("keeps rationale unchanged when ≤ 120 chars", () => {
    const rationale = "Short rationale.";
    const top = toTopFinding(makeFinding({ rationale }));
    expect(top.rationale_snippet).toBe("Short rationale.");
  });

  it("truncates at word boundary and appends '…' when > 120 chars", () => {
    // 116 'a's + " word" = 121 chars total → should truncate
    const rationale = "a".repeat(116) + " word";
    const top = toTopFinding(makeFinding({ rationale }));
    expect(top.rationale_snippet).toBe("a".repeat(116) + "…");
  });

  it("does not truncate a 120-char rationale", () => {
    const rationale = "a".repeat(120);
    const top = toTopFinding(makeFinding({ rationale }));
    expect(top.rationale_snippet).toBe(rationale);
  });
});

describe("FindingsTooltip", () => {
  const findings: TopFinding[] = [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "bug",
      title: "SQL injection",
      file: "server.ts",
      start_line: 10,
      end_line: 12,
      confidence: 0.95,
      rationale_snippet: "User input passed directly.",
    },
  ];

  it("shows finding title in tooltip when hovered", () => {
    const { container } = render(
      <FindingsTooltip
        bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        findings={findings}
      />
    );
    fireEvent.mouseEnter(container.firstChild!);
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("1 FINDINGS")).toBeInTheDocument();
  });

  it("hides tooltip on mouse leave", () => {
    const { container } = render(
      <FindingsTooltip
        bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        findings={findings}
      />
    );
    fireEvent.mouseEnter(container.firstChild!);
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    fireEvent.mouseLeave(container.firstChild!);
    expect(screen.queryByText("SQL injection")).not.toBeInTheDocument();
  });

  it("does not open tooltip when findings and bySeverity are empty", () => {
    const { container } = render(
      <FindingsTooltip bySeverity={null} findings={[]} />
    );
    fireEvent.mouseEnter(container.firstChild!);
    expect(screen.queryByText(/FINDINGS/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run to confirm failure**

```bash
cd client && pnpm test --run src/components/findings-severity-badges/FindingsTooltip.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `FindingsSeverityBadges.tsx`**

Create `client/src/components/findings-severity-badges/FindingsSeverityBadges.tsx`:

```tsx
"use client";

import React from "react";
import { SeverityBadge, type Severity } from "@devdigest/ui";

type BySeverity = { CRITICAL: number; WARNING: number; SUGGESTION: number };

const SEVS: { key: keyof BySeverity; sev: Severity }[] = [
  { key: "CRITICAL", sev: "CRITICAL" },
  { key: "WARNING",  sev: "WARNING"  },
  { key: "SUGGESTION", sev: "SUGGESTION" },
];

export function FindingsSeverityBadges({ bySeverity }: { bySeverity: BySeverity | null | undefined }) {
  const active = SEVS.filter(({ key }) => (bySeverity?.[key] ?? 0) > 0);
  if (!bySeverity || active.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      {active.map(({ key, sev }) => (
        <SeverityBadge key={key} severity={sev} count={bySeverity[key]} compact />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run `FindingsSeverityBadges` tests to confirm they pass**

```bash
cd client && pnpm test --run src/components/findings-severity-badges/FindingsSeverityBadges.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 7: Implement `FindingsTooltip.tsx`**

Create `client/src/components/findings-severity-badges/FindingsTooltip.tsx`:

```tsx
"use client";

import React from "react";
import { CategoryTag, MonoLink, ConfidenceNum, type Category } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { FindingsSeverityBadges } from "./FindingsSeverityBadges";
import type { TopFinding } from "./index";

type BySeverity = { CRITICAL: number; WARNING: number; SUGGESTION: number };

function lineLabel(f: Pick<TopFinding, "start_line" | "end_line">): string {
  return f.start_line === f.end_line
    ? `${f.start_line}`
    : `${f.start_line}-${f.end_line}`;
}

export function FindingsTooltip({
  bySeverity,
  findings,
  repoFullName,
  headSha,
}: {
  bySeverity: BySeverity | null | undefined;
  findings: TopFinding[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  const total = bySeverity
    ? bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.SUGGESTION
    : findings.length;
  const hasContent = total > 0 || findings.length > 0;

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => { if (hasContent) setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
    >
      <FindingsSeverityBadges bySeverity={bySeverity} />

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 380,
            zIndex: 50,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--border)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {total} FINDINGS
          </div>

          {/* scrollable list */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {findings.map((f) => {
              const href =
                repoFullName && headSha
                  ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
                  : undefined;
              return (
                <div
                  key={f.id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={f.title}
                    >
                      {f.title}
                    </span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MonoLink href={href}>
                      {f.file}:{lineLabel(f)}
                    </MonoLink>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.rationale_snippet}
                  >
                    {f.rationale_snippet}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Implement the barrel `index.ts` with `TopFinding` type and `toTopFinding`**

Create `client/src/components/findings-severity-badges/index.ts`:

```ts
export { FindingsSeverityBadges } from "./FindingsSeverityBadges";
export { FindingsTooltip } from "./FindingsTooltip";
export type { TopFinding } from "./types";
export { toTopFinding } from "./types";
```

Wait — to keep things in one file (simpler), put `TopFinding` and `toTopFinding` in `FindingsTooltip.tsx` and export from barrel:

Instead, define them in `index.ts` directly:

```ts
import type { FindingRecord } from "@devdigest/shared";

export { FindingsSeverityBadges } from "./FindingsSeverityBadges";
export { FindingsTooltip } from "./FindingsTooltip";

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
    id:               f.id,
    severity:         f.severity,
    category:         f.category,
    title:            f.title,
    file:             f.file,
    start_line:       f.start_line,
    end_line:         f.end_line,
    confidence:       f.confidence,
    rationale_snippet: snippet,
  };
}
```

**Important:** `FindingsTooltip.tsx` imports `TopFinding` from `./index`, which imports from `./FindingsTooltip.tsx` — this is a circular dependency. Solve by moving `TopFinding` and `toTopFinding` into a separate `types.ts` file:

Create `client/src/components/findings-severity-badges/types.ts`:

```ts
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
    id:               f.id,
    severity:         f.severity,
    category:         f.category,
    title:            f.title,
    file:             f.file,
    start_line:       f.start_line,
    end_line:         f.end_line,
    confidence:       f.confidence,
    rationale_snippet: snippet,
  };
}
```

Update `FindingsTooltip.tsx` to import from `./types` instead of `./index`:

```ts
import type { TopFinding } from "./types";
```

Create `client/src/components/findings-severity-badges/index.ts`:

```ts
export { FindingsSeverityBadges } from "./FindingsSeverityBadges";
export { FindingsTooltip } from "./FindingsTooltip";
export type { TopFinding } from "./types";
export { toTopFinding } from "./types";
```

- [ ] **Step 9: Run all tests in the component folder**

```bash
cd client && pnpm test --run src/components/findings-severity-badges/
```

Expected: 8 tests PASS (4 `FindingsSeverityBadges` + 4 `FindingsTooltip/toTopFinding`).

- [ ] **Step 10: Typecheck client**

```bash
cd client && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/findings-severity-badges/
git commit -m "feat(client): add FindingsSeverityBadges + FindingsTooltip components"
```

---

## Task 4: PR list integration — new column in header + PRRow + i18n

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/constants.ts`
- Modify: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- Modify: `client/messages/en/prReview.json`

**Interfaces:**
- Consumes: `FindingsTooltip` from Task 3; `PrMeta.findings_by_severity` + `PrMeta.top_findings` from Task 1.
- Produces: visible Findings column in the PR list table.

- [ ] **Step 1: Update `constants.ts` — add column key and widen GRID**

In `client/src/app/repos/[repoId]/pulls/constants.ts`, make two changes:

1. Insert `"findings"` after `"score"` in `COLUMN_KEYS`:
```ts
export const COLUMN_KEYS: string[] = [
  "pullRequest",
  "author",
  "size",
  "score",
  "findings",   // ← NEW
  "status",
  "cost",
  "updated",
];
```

2. Add a 100px column between the 60px score column and the 118px status column in `GRID`:
```ts
export const GRID = "1fr 132px 92px 60px 100px 118px 78px 78px";
```

- [ ] **Step 2: Add the i18n key**

In `client/messages/en/prReview.json`, inside `"list" → "columns"`, add:

```json
"findings": "Findings"
```

The full columns block becomes:
```json
"columns": {
  "pullRequest": "Pull request",
  "author": "Author",
  "size": "Size",
  "score": "Score",
  "findings": "Findings",
  "status": "Status",
  "cost": "Cost",
  "updated": "Updated"
}
```

- [ ] **Step 3: Add the findings cell to `PRRow.tsx`**

In `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`:

1. Add the import at the top (after existing imports):
```ts
import { FindingsTooltip } from "@/components/findings-severity-badges";
```

2. Insert the findings `<div>` cell between the score cell and the status cell:
```tsx
<div style={s.scoreCell}>
  {reviewed ? (
    <CircularScore score={pr.score!} size={34} stroke={3} />
  ) : (
    <span style={s.muted}>—</span>
  )}
</div>
{/* ← INSERT AFTER THIS LINE */}
<div>
  <FindingsTooltip
    bySeverity={pr.findings_by_severity}
    findings={pr.top_findings ?? []}
  />
</div>
<div>
  <Badge dot color={st.c} bg="transparent">
```

- [ ] **Step 4: Typecheck client**

```bash
cd client && pnpm typecheck
```

Expected: zero errors. (`pr.findings_by_severity` and `pr.top_findings` are now on `PrMeta` from Task 1.)

- [ ] **Step 5: Commit**

```bash
git add client/src/app/repos/[repoId]/pulls/constants.ts \
        client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx \
        client/messages/en/prReview.json
git commit -m "feat(client): add Findings column to PR list table"
```

---

## Task 5: PR detail — Timeline (`RunHistory` + `FindingsTab`)

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`

**Interfaces:**
- Consumes: `FindingsTooltip`, `toTopFinding` from Task 3; `ReviewRecord` from `@devdigest/shared` (already imported in `FindingsTab`).
- Produces: each settled run row in the Timeline shows `FindingsTooltip` instead of the plain text "X finding(s) · Y blocker(s)".

- [ ] **Step 1: Add `reviews` prop to `RunHistory` and replace the text**

In `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`:

1. Add imports at the top:
```ts
import type { ReviewRecord } from "@devdigest/shared";
import { FindingsTooltip, toTopFinding } from "@/components/findings-severity-badges";
```

2. Add `reviews?: ReviewRecord[]` to the props interface:
```ts
export function RunHistory({
  runs,
  commits = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
  reviews,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
  reviews?: ReviewRecord[];
})
```

3. Inside the `settled` block (the JSX that renders a run row), replace the current findings/blockers text:

Find this code:
```tsx
{settled && (
  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
    {t("runStatus.findings", { count: r.findings_count ?? 0 })}
    {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
  </div>
)}
```

Replace with:
```tsx
{settled && (() => {
  const matchingReview = reviews?.find((rv) => rv.run_id === r.run_id);
  const runFindings = matchingReview?.findings ?? [];
  const bySeverity = {
    CRITICAL:   runFindings.filter((f) => f.severity === "CRITICAL").length,
    WARNING:    runFindings.filter((f) => f.severity === "WARNING").length,
    SUGGESTION: runFindings.filter((f) => f.severity === "SUGGESTION").length,
  };
  const topFindings = runFindings.map(toTopFinding);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <FindingsTooltip bySeverity={bySeverity} findings={topFindings} />
      {(r.blockers ?? 0) > 0 && (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("runStatus.blockers", { count: r.blockers ?? 0 })}
        </span>
      )}
    </div>
  );
})()}
```

- [ ] **Step 2: Pass `reviews={runs}` from `FindingsTab` to `RunHistory`**

In `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`, find the `<RunHistory>` usage:

```tsx
<RunHistory
  runs={prRuns ?? []}
  commits={prCommits}
  onOpenTrace={handleOpenTrace}
  onGoToReview={handleGoToReview}
  onDelete={handleDelete}
/>
```

Add the `reviews` prop:
```tsx
<RunHistory
  runs={prRuns ?? []}
  commits={prCommits}
  onOpenTrace={handleOpenTrace}
  onGoToReview={handleGoToReview}
  onDelete={handleDelete}
  reviews={runs}
/>
```

(`runs` is the `ReviewRecord[]` that `FindingsTab` already receives as `runs` prop.)

- [ ] **Step 3: Typecheck client**

```bash
cd client && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run existing RunHistory tests**

```bash
cd client && pnpm test --run src/app/repos/\[repoId\]/pulls/\[number\]/_components/RunHistory/
```

Expected: all existing tests PASS (the new `reviews` prop is optional, so existing tests are unaffected).

- [ ] **Step 5: Commit**

```bash
git add client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/RunHistory/RunHistory.tsx \
        client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/FindingsTab/FindingsTab.tsx
git commit -m "feat(client): replace RunHistory findings text with FindingsTooltip"
```

---

## Task 6: PR detail — Review Runs accordion header

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx`

**Interfaces:**
- Consumes: `FindingsTooltip`, `toTopFinding` from Task 3; existing `review.findings: FindingRecord[]`.
- Produces: the accordion header shows `FindingsTooltip` instead of the plain "{N} finding(s) · {B} blocker(s)" text.

- [ ] **Step 1: Add imports to `ReviewRunAccordion.tsx`**

```ts
import { FindingsTooltip, toTopFinding } from "@/components/findings-severity-badges";
```

- [ ] **Step 2: Compute `bySeverity` from `review.findings`**

After the existing `blockers` computation (line ~56), add:

```ts
const bySeverity = {
  CRITICAL:   findings.filter((f) => f.severity === "CRITICAL").length,
  WARNING:    findings.filter((f) => f.severity === "WARNING").length,
  SUGGESTION: findings.filter((f) => f.severity === "SUGGESTION").length,
};
const topFindings = findings.map(toTopFinding);
```

- [ ] **Step 3: Replace the findings/blockers text span in the accordion header**

Find this code in the accordion header JSX:
```tsx
<span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
  {findings.length} finding{findings.length === 1 ? "" : "s"}
  {blockers > 0 ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}
</span>
```

Replace with:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  <FindingsTooltip
    bySeverity={bySeverity}
    findings={topFindings}
    repoFullName={repoFullName}
    headSha={headSha}
  />
  {blockers > 0 && (
    <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
      · {blockers} blocker{blockers === 1 ? "" : "s"}
    </span>
  )}
</div>
```

- [ ] **Step 4: Typecheck client**

```bash
cd client && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 5: Run full client test suite**

```bash
cd client && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx
git commit -m "feat(client): replace ReviewRunAccordion findings text with FindingsTooltip"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §1 — `PrMeta` contract extension (both copies) | Task 1 |
| §2 — `FindingsSeverityBadges` (pills, zero/null → "—") | Task 3 step 5 |
| §2 — `FindingsTooltip` (hover panel, header, scrollable list) | Task 3 step 7 |
| §2 — Tooltip: header = "N FINDINGS" | Task 3 step 7 (hardcoded `{total} FINDINGS`) |
| §2 — Tooltip: per-row: icon · title · category · file:line · confidence · snippet | Task 3 step 7 |
| §2 — Tooltip: z-index, width 380px, below trigger | Task 3 step 7 |
| §2 — Tooltip: open on mouseenter, close on mouseleave | Task 3 step 7 |
| §2 — Tooltip: no-op when both empty | Task 3 step 7 (`hasContent` guard) |
| §2 — Barrel export: `TopFinding`, `toTopFinding` | Task 3 step 8 |
| §3 — Server IN-query for non-dismissed findings | Task 2 step 3 |
| §3 — `top_findings` sorted CRITICAL→WARNING→SUGGESTION, confidence DESC, top 6 | Task 2 step 3 |
| §3 — `rationale_snippet` = first ≤120 chars, trim to word boundary, append `…` | Task 2 step 2 (`snippetOf`) |
| §4a — PR list: "findings" column key + GRID update | Task 4 step 1 |
| §4a — PR list: PRRow renders `FindingsTooltip` | Task 4 step 3 |
| §4a — PR list: i18n key `list.columns.findings` | Task 4 step 2 |
| §4b — RunHistory: `reviews?` prop + `FindingsTooltip` | Task 5 step 1 |
| §4b — FindingsTab passes `reviews={runs}` | Task 5 step 2 |
| §4c — ReviewRunAccordion: `FindingsTooltip` + blocker count | Task 6 steps 2–3 |
| §5 — `toTopFinding` helper | Task 3 step 8 (`types.ts`) |
| §6 — Unit tests for `FindingsSeverityBadges` | Task 3 step 1 |
| §6 — Unit test for `FindingsTooltip` | Task 3 step 3 |
| §6 — Unit test for `toTopFinding` truncation | Task 3 step 3 |

**Placeholder scan:** No TBDs or "similar to Task N" references — all steps include actual code.

**Type consistency:**
- `TopFinding` defined once in `types.ts`, re-exported from `index.ts`. `FindingsTooltip.tsx` imports from `./types`, not `./index` (no circular dependency).
- `toTopFinding` signature: `(f: FindingRecord) => TopFinding` — consistent across Tasks 3, 5, 6.
- `bySeverity` shape `{ CRITICAL: number; WARNING: number; SUGGESTION: number }` is the same literal type used in `FindingsSeverityBadges`, `FindingsTooltip`, and all call sites.
- Server `FindingsBucket.top` shape matches the `top_findings` Zod schema field names (`start_line`, `end_line`, not camelCase).
