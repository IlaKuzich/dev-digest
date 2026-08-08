"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastCard } from "./_components/BlastCard";
import { PrBriefCard } from "./_components/PrBriefCard";
import { ReviewFocusCard } from "./_components/ReviewFocusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  onFocusDiffLine?: (file: string, line: number) => void;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha, onFocusDiffLine }: OverviewTabProps) {
  return (
    <>
      <PrBriefCard prId={prId} />

      <div style={s.cardGrid}>
        <IntentCard prId={prId} />
        <BlastCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      <ReviewFocusCard prId={prId} onFocusDiffLine={onFocusDiffLine} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
