/* FirstTasksSection — non-clickable cards (no onClick/href on the card itself,
   per AC-30: there is no navigation target for a not-yet-created file). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FirstTask } from "@devdigest/shared";

interface Props {
  tasks: FirstTask[];
}

const COMPLEXITY_COLOR: Record<string, string> = {
  Low: "var(--ok)",
  Medium: "var(--warn)",
  High: "var(--crit)",
};

export function FirstTasksSection({ tasks }: Props) {
  const t = useTranslations("onboarding.firstTasks");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {tasks.map((task, i) => (
        <div
          key={i}
          data-testid="first-task-card"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "16px 18px",
            background: "var(--bg-elevated)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>
              {task.title}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: `${COMPLEXITY_COLOR[task.complexity] ?? "var(--text-muted)"}22`,
                color: COMPLEXITY_COLOR[task.complexity] ?? "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              {task.complexity}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: "var(--bg)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {t(`gapType.${task.gapType}`)}
            </span>
          </div>

          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("suggestedPathLabel")}:{" "}
            </span>
            <code
              style={{
                fontSize: 12,
                background: "var(--bg)",
                padding: "2px 6px",
                borderRadius: 4,
                color: "var(--accent)",
              }}
            >
              {task.suggestedPath}
            </code>
          </div>

          <p
            style={{
              margin: "0 0 8px",
              color: "var(--text-secondary)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {task.rationale}
          </p>

          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("patternPointerLabel")}:{" "}
            </span>
            <code
              style={{
                fontSize: 12,
                background: "var(--bg)",
                padding: "2px 6px",
                borderRadius: 4,
                color: "var(--text-secondary)",
              }}
            >
              {task.patternPointer}
            </code>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontStyle: "italic",
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
              marginTop: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>
              {t("verificationHintLabel")}:{" "}
            </span>
            {task.verificationHint}
          </div>
        </div>
      ))}
    </div>
  );
}

export default FirstTasksSection;
