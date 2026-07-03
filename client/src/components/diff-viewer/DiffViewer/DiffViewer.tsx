/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React, { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  targetFile,
  targetLine,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  targetFile?: string;
  targetLine?: number;
}) {
  const t = useTranslations("shell");

  // Scroll to the target line (or file card as fallback) after render
  useEffect(() => {
    if (!targetFile) return;
    // Try the specific line element first
    if (targetLine !== undefined) {
      const lineEl = document.getElementById(
        `diff-line-${targetFile}-${targetLine}`,
      );
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    // Fall back to file card
    const id = `diff-file-${CSS.escape(targetFile)}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [targetFile, targetLine]);

  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          initialOpen={targetFile === f.path ? true : undefined}
          targetLine={targetFile === f.path ? targetLine : undefined}
        />
      ))}
    </div>
  );
}
