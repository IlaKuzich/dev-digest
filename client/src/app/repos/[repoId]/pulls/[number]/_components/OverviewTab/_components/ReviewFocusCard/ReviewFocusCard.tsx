/* ReviewFocusCard — L07: "read these first" list at the bottom of the PR
   Overview tab. Sourced from the same Brief as PrBriefCard (useBrief) — this
   card only appears once a Brief exists; PrBriefCard owns the Generate
   prompt for the not-yet-generated state (AC-17). Each entry is a single
   real <button> (nested-interactives rule, client INSIGHTS.md 2026-07-16)
   that reuses the existing onFocusDiffLine/DiffFocus deep-link, exactly like
   FindingsTab. File paths are display/nav only — never a filesystem read
   (AC-23). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Icon } from "@devdigest/ui";
import { useBrief } from "@/lib/hooks/brief";
import { s } from "./styles";

interface ReviewFocusCardProps {
  prId: string | null;
  onFocusDiffLine?: (file: string, line: number) => void;
}

export function ReviewFocusCard({ prId, onFocusDiffLine }: ReviewFocusCardProps) {
  const t = useTranslations("brief");
  const { data: brief } = useBrief(prId);

  // The card only appears once a Brief exists — PrBriefCard owns the
  // Generate prompt for the null (not-yet-generated) case.
  if (brief == null) return null;

  const items = brief.review_focus;

  return (
    <section style={s.card}>
      <SectionLabel
        icon="ListChecks"
        right={items.length > 0 ? <Badge>{items.length}</Badge> : undefined}
      >
        {t("reviewFocus.title")}
      </SectionLabel>

      {items.length === 0 ? (
        <p style={s.empty}>{t("reviewFocus.empty")}</p>
      ) : (
        <div style={s.list}>
          {items.map((item, i) => (
            <button
              key={`${item.file}:${item.line}:${i}`}
              type="button"
              style={s.row}
              aria-label={`${item.file}:${item.line} — ${item.reason}`}
              onClick={() => onFocusDiffLine?.(item.file, item.line)}
            >
              <Icon.ChevronRight size={13} style={s.rowIcon} />
              <span>
                <span className="mono" style={s.location}>
                  {item.file}:{item.line}
                </span>{" "}
                <span style={s.reason}>— {item.reason}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
