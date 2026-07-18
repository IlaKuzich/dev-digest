"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { PrBriefCard } from "./_components/PrBriefCard";
import type { PrReviewSummary } from "./_components/PrBriefCard/helpers";
import { IntentCard } from "./_components/IntentCard";
import { BlastCard } from "./_components/BlastCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  reviewSummary: PrReviewSummary;
  onFocusDiffLine: (file: string, line: number) => void;
}

export function OverviewTab({
  prBody,
  prId,
  repoFullName,
  headSha,
  reviewSummary,
  onFocusDiffLine,
}: OverviewTabProps) {
  return (
    <>
      <PrBriefCard
        prId={prId}
        repoFullName={repoFullName}
        headSha={headSha}
        reviewSummary={reviewSummary}
        onFocusDiffLine={onFocusDiffLine}
      />

      <div style={s.cardGrid}>
        <IntentCard prId={prId} />
        <BlastCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
