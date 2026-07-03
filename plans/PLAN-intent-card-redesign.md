# Plan: Intent Card UI Redesign

> Status: DRAFT
> Created: 2026-06-25

## Problem

The current `IntentCard` renders scope lists as plain `<ul><li>` blocks stacked
vertically. The design shows:
- Quote: full-width italic text
- Two-column layout: IN SCOPE (left, green label, blue chip items) | OUT OF SCOPE (right, grey label, dot-prefix text)
- No Risk Areas section (out of scope for Intent Layer — separate feature)

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| client: IntentCard | `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` | Rewrite styles |

## Design Spec

```
┌────────────────────────────────────────────────────────────┐
│ ◎ INTENT                                                    │
│                                                             │
│  "Add rate limiting to public API endpoints to prevent     │
│   abuse from unauthenticated clients."                     │
│                                                             │
│  ✓ IN SCOPE          ╎  ✕ OUT OF SCOPE                     │
│  [Add middleware...]  ╎  · Authentication changes           │
│  [Apply to /api/...]  ╎  · Adding new endpoints            │
│  [Return 429...]      ╎  · Logging / observability         │
│                                                             │
│                                              ↻ Recalculate │
└────────────────────────────────────────────────────────────┘
```

**IN SCOPE items** — chip/tag style:
- Background: `rgba(59, 130, 246, 0.12)` (blue tint, dark-theme-safe)
- Border-left: `2px solid rgba(59, 130, 246, 0.5)` (blue accent)
- Border-radius: `4px`
- Padding: `2px 8px`
- Color: `var(--text-secondary)`
- Font-size: `12px`
- Display: `inline-block`, `margin-bottom: 4px`

**OUT OF SCOPE items** — plain text:
- No chip background
- Prefix: `·` dot
- Color: `var(--text-muted)`
- Font-size: `12px`

**Column labels:**
- `✓ IN SCOPE` — color: `#4ade80` (green-400), font-size: 11px, font-weight: 600, uppercase
- `✕ OUT OF SCOPE` — color: `var(--text-muted)`, font-size: 11px, font-weight: 600, uppercase

**Two-column grid:**
- `display: grid; grid-template-columns: 1fr 1fr; gap: 16px`
- Vertical divider: `border-left: 1px solid var(--border)` on the right column

## Tasks

### TASK-001: Rewrite IntentCard layout

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`

**Implementation:**

```tsx
"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { Intent } from "@devdigest/shared";
import type { CSSProperties } from "react";

interface IntentCardProps {
  intent: Intent | null | undefined;
  isLoading: boolean;
  onRecalculate: () => void;
  recalculating: boolean;
}

const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  quote: {
    fontStyle: "italic",
    color: "var(--text-primary)",
    fontSize: 14,
    lineHeight: 1.55,
    marginTop: 0,
    marginBottom: 16,
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  rightCol: {
    borderLeft: "1px solid var(--border)",
    paddingLeft: 16,
  } satisfies CSSProperties,
  colLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 8,
  } satisfies CSSProperties,
  inScopeLabel: {
    color: "#4ade80",
  } satisfies CSSProperties,
  outScopeLabel: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chip: {
    display: "inline-block",
    background: "rgba(59, 130, 246, 0.12)",
    borderLeft: "2px solid rgba(59, 130, 246, 0.5)",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 4,
  } satisfies CSSProperties,
  outItem: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 4,
    paddingLeft: 2,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 12,
  } satisfies CSSProperties,
  recalcBtn: {
    fontSize: 12,
    color: "var(--text-muted)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
};

export function IntentCard({
  intent,
  isLoading,
  onRecalculate,
  recalculating,
}: IntentCardProps) {
  if (isLoading || !intent) return null;

  return (
    <section>
      <SectionLabel icon="Target">Intent</SectionLabel>
      <div style={s.card}>
        {/* Quote */}
        <p style={s.quote}>&ldquo;{intent.intent}&rdquo;</p>

        {/* Two-column scope grid */}
        <div style={s.columns}>
          {/* IN SCOPE */}
          <div>
            <div style={{ ...s.colLabel, ...s.inScopeLabel }}>✓ In scope</div>
            {intent.in_scope.map((item) => (
              <div key={item} style={s.chip}>{item}</div>
            ))}
          </div>

          {/* OUT OF SCOPE */}
          <div style={s.rightCol}>
            <div style={{ ...s.colLabel, ...s.outScopeLabel }}>✕ Out of scope</div>
            {intent.out_of_scope.map((item) => (
              <div key={item} style={s.outItem}>· {item}</div>
            ))}
          </div>
        </div>

        {/* Footer: Recalculate */}
        <div style={s.footer}>
          <button
            onClick={onRecalculate}
            disabled={recalculating}
            style={s.recalcBtn}
          >
            {recalculating ? "Recalculating…" : "↻ Recalculate"}
          </button>
        </div>
      </div>
    </section>
  );
}
```

**Acceptance Criteria:**
- [ ] AC-001: IN SCOPE items render as blue-tinted chips with left border accent
- [ ] AC-002: OUT OF SCOPE items render as plain muted text with `·` prefix
- [ ] AC-003: Two-column grid with vertical divider between columns
- [ ] AC-004: Quote renders full-width above the columns
- [ ] AC-005: Recalculate button is right-aligned at bottom
- [ ] AC-006: `cd client && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001–005 | Visual check in browser on a PR with derived intent |
| AC-006 | `cd client && pnpm typecheck` |

## Out of Scope

- **Risk Areas section** — NOT in current `Intent` schema `{ intent, in_scope[], out_of_scope[] }`.
  Requires schema extension + separate LLM derivation step. Separate plan if needed.
- No backend changes
- No DB changes
