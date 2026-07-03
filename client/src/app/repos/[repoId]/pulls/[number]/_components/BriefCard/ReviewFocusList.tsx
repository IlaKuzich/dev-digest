"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

/** Shorten a file path: keep last 2 segments, prefix with …/ when truncated. */
function shortenPath(ref: string): string {
  const path = ref.replace(/:\d+$/, ""); // strip optional :line
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

interface ReviewFocusListProps {
  items: ReviewFocusItem[];
  onNavigate: (ref: string) => void;
}

/** "Read this first" list — each item's file_refs are clickable and navigate
   into the Files changed tab (AC-005/AC-14). Hidden entirely when empty
   (AC-007/edge case: 0 review_focus hides the section). */
export function ReviewFocusList({ items, onNavigate }: ReviewFocusListProps) {
  const t = useTranslations("brief");

  if (items.length === 0) return null;

  return (
    <div style={s.reviewFocus}>
      <div style={s.reviewFocusHeader}>
        <span style={s.reviewFocusLabel}>{t("reviewFocus.label")}</span>
        <span style={s.reviewFocusBadge}>{items.length}</span>
      </div>
      <ul style={s.reviewFocusListEl}>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} style={s.reviewFocusItem}>
            <span style={s.reviewFocusBullet}>•</span>
            {item.file_refs.length > 0 ? (
              <>
                <span style={s.reviewFocusRefs}>
                  {item.file_refs.map((ref, ri) => (
                    <React.Fragment key={ref}>
                      {ri > 0 && <span style={s.reviewFocusRefSep}>, </span>}
                      <button
                        type="button"
                        onClick={() => onNavigate(ref)}
                        style={s.reviewFocusRefBtn}
                        title={ref}
                      >
                        {shortenPath(ref)}
                      </button>
                    </React.Fragment>
                  ))}
                </span>
                <span style={s.reviewFocusSep}>—</span>
                <span style={s.reviewFocusText}>{item.label}</span>
              </>
            ) : (
              <span style={s.reviewFocusText}>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
