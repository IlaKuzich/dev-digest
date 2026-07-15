/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard, type DiffFocus } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  focus,
  findingsByFile,
  onFocusLine,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Deep-link focus into a file/line (clicking a finding's file:line). */
  focus?: DiffFocus | null;
  /** Opt-in inline-findings overlay, by file path — each file's active
      (non-dismissed) findings. Absent ⇒ no badges/borders render — every
      other DiffViewer usage is unaffected. */
  findingsByFile?: Map<string, FindingRecord[]>;
  /** Fires (file path, NEW-file line) when a finding badge is clicked —
      only relevant when `findingsByFile` is passed. */
  onFocusLine?: (file: string, line: number) => void;
}) {
  const t = useTranslations("shell");
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
          focus={focus}
          findings={findingsByFile?.get(f.path)}
          onFocusLine={onFocusLine}
        />
      ))}
    </div>
  );
}
