"use client";

import React from "react";
import type { SpecFile } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";

interface Props {
  docs: SpecFile[];
  activeDoc: SpecFile | null;
  onSelect: (doc: SpecFile) => void;
}

/**
 * ContextDocList — left panel of the Project Context page.
 * Shows all discovered .md files with path and token count.
 */
export function ContextDocList({ docs, activeDoc, onSelect }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 6,
        overflowY: "auto",
      }}
    >
      {docs.map((doc) => {
        const path = doc.path ?? "";
        const isActive = activeDoc?.path === path;

        return (
          <button
            key={path}
            onClick={() => onSelect(doc)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 6,
              background: isActive ? "var(--accent-bg)" : "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            {/* File icon */}
            <Icon.FileText
              size={14}
              color={isActive ? "var(--accent)" : "var(--text-muted)"}
              style={{ flexShrink: 0 }}
            />

            {/* Path */}
            <span
              className="mono"
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--accent-text)" : "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={path}
            >
              {path}
            </span>
          </button>
        );
      })}
    </div>
  );
}
