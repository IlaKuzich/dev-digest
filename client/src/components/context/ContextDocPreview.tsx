"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";

interface Props {
  doc: SpecFile | null;
}

/** Coverage donut ring — hardcoded 78% stub. */
function CoverageRing() {
  const RADIUS = 16;
  const CIRC = 2 * Math.PI * RADIUS;
  const PCT = 78;
  const offset = CIRC * (1 - PCT / 100);

  return (
    <svg
      width={40}
      height={40}
      viewBox="0 0 40 40"
      style={{ flexShrink: 0 }}
      aria-label={`${PCT}% coverage`}
    >
      <circle
        cx={20}
        cy={20}
        r={RADIUS}
        fill="none"
        stroke="var(--border)"
        strokeWidth={3}
      />
      <circle
        cx={20}
        cy={20}
        r={RADIUS}
        fill="none"
        stroke="var(--color-success, #22c55e)"
        strokeWidth={3}
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text
        x={20}
        y={24}
        textAnchor="middle"
        fontSize={9}
        fill="var(--text-secondary)"
      >
        {PCT}%
      </text>
    </svg>
  );
}

/**
 * ContextDocPreview — center panel of the Project Context page.
 * Renders the selected file's markdown content with a preview/edit header.
 */
export function ContextDocPreview({ doc }: Props) {
  const t = useTranslations("context");
  const [tab] = React.useState<"preview">("preview");
  const { data: agents } = useAgents();
  const usedByCount = React.useMemo(
    () =>
      doc
        ? (agents ?? []).filter((a) => a.context_doc_paths.includes(doc.path))
            .length
        : 0,
    [agents, doc],
  );

  if (!doc) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
          fontSize: 14,
        }}
      >
        {t("page.selectFile")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Preview header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-surface)",
        }}
      >
        {/* File name */}
        <span
          className="mono"
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            flexShrink: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doc.path}
        </span>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            flexShrink: 0,
            padding: 2,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-hover)",
          }}
        >
          <button
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "3px 12px",
              borderRadius: 4,
              border: "none",
              background:
                tab === "preview" ? "var(--text-primary)" : "transparent",
              color:
                tab === "preview" ? "var(--bg-surface)" : "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {t("page.preview.tabPreview")}
          </button>
          <button
            disabled
            title={t("page.toolbar.comingSoon")}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "3px 12px",
              borderRadius: 4,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "not-allowed",
            }}
          >
            {t("page.preview.tabEdit")}
          </button>
        </div>

        {/* Spacer pushes "Used by" + ring to the far right */}
        <div style={{ flex: 1 }} />

        {/* Used by N agents */}
        <span
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            flexShrink: 0,
          }}
        >
          {t("page.preview.usedBy", { count: usedByCount })}
        </span>

        {/* Coverage ring */}
        <CoverageRing />
      </div>

      {/* Markdown content */}
      <div style={{ flex: 1, padding: "20px 28px", overflowY: "auto" }}>
        <Markdown>{doc.content ?? ""}</Markdown>
      </div>
    </div>
  );
}
