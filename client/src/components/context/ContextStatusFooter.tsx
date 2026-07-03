"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SpecFile } from "@devdigest/shared";

interface Props {
  docs: SpecFile[];
  /** Non-null only after Reindex was clicked in the current browser session. */
  refreshedAt: Date | null;
}

/**
 * ContextStatusFooter — footer bar for the Project Context page.
 *
 * Always shows: ● N documents · X tokens total
 * After Reindex in current session, appends: · refreshed Xm ago
 */
export function ContextStatusFooter({ docs, refreshedAt }: Props) {
  const t = useTranslations("context");

  const tokensTotal = docs.reduce(
    (sum, d) => sum + (d.estimated_tokens ?? 0),
    0,
  );

  const minutesAgo = refreshedAt
    ? Math.floor((Date.now() - refreshedAt.getTime()) / 60_000)
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 20px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-surface)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
        {t("page.footer.docs", {
          count: docs.length,
          tokens: tokensTotal.toLocaleString(),
        })}
        {minutesAgo !== null && (
          <span style={{ color: "var(--text-muted)" }}>
            {" "}
            {t("page.footer.refreshed", { minutes: minutesAgo })}
          </span>
        )}
      </span>
    </div>
  );
}
