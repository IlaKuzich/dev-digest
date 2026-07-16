"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastCard } from "./_components/BlastCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  onOpenBlast: () => void;
}

export function OverviewTab({ prBody, prId, onOpenBlast }: OverviewTabProps) {
  return (
    <>
      <div style={s.cardGrid}>
        <IntentCard prId={prId} />
        <BlastCard prId={prId} onOpenBlast={onOpenBlast} />
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
