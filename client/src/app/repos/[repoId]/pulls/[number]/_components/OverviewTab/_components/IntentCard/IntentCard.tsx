/* IntentCard — L03: shows the derived PR intent (motivation + scope) before
   review. Empty until derived; a Derive/Recompute action (re)runs the
   classifier via useDeriveIntent. Page-local to the PR Overview tab. */
"use client";

import React from "react";
import { SectionLabel, Button, EmptyState, Skeleton } from "@devdigest/ui";
import { useIntent, useDeriveIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null;
}

export function IntentCard({ prId }: IntentCardProps) {
  const { data: intent, isLoading } = useIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) {
    return (
      <section style={s.card}>
        <SectionLabel icon="Sparkles">Intent</SectionLabel>
        <Skeleton height={15} width="80%" />
        <Skeleton height={15} width="55%" style={{ marginTop: 6 }} />
      </section>
    );
  }

  if (intent == null) {
    return (
      <section style={s.card}>
        <SectionLabel icon="Sparkles">Intent</SectionLabel>
        <EmptyState
          icon="Sparkles"
          title="No intent derived yet"
          body="Infer the PR's motivation and scope from its title, description, linked issue, and changed files."
          cta="Derive intent"
          onCta={() => derive.mutate()}
          ctaLoading={derive.isPending}
        />
      </section>
    );
  }

  return (
    <section style={s.card}>
      <SectionLabel
        icon="Sparkles"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={derive.isPending}
            onClick={() => derive.mutate()}
            aria-label="Recompute intent"
          >
            Recompute
          </Button>
        }
      >
        Intent
      </SectionLabel>
      <div style={s.body} aria-live="polite">
        <p style={s.summary}>&ldquo;{intent.intent}&rdquo;</p>

        {intent.in_scope.length > 0 && (
          <div style={s.listBlock}>
            <div style={s.listLabel}>In scope</div>
            <ul style={s.list}>
              {intent.in_scope.map((item) => (
                <li key={item} style={s.listItem}>
                  <span style={s.checkIcon} aria-hidden="true">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {intent.out_of_scope.length > 0 && (
          <div style={s.listBlock}>
            <div style={s.listLabel}>Out of scope</div>
            <ul style={s.list}>
              {intent.out_of_scope.map((item) => (
                <li key={item} style={{ ...s.listItem, ...s.mutedItem }}>
                  <span style={s.xIcon} aria-hidden="true">
                    ✗
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
