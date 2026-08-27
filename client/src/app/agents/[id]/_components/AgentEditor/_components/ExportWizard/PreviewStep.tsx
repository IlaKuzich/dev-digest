"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { YamlEditor } from "@/components/yaml-editor";
import { s } from "./styles";

/** Preview step (AC-10/11/12/13/46, mockup `wizard-step2-preview.png`).
 *  `files` is the LIVE `action=preview` response (runner bundle already
 *  filtered out by the caller) — never a hardcoded sample. Only the file the
 *  server marked `editable` gets the CodeMirror `YamlEditor`; every other
 *  file is a plain read-only `<pre>` (AC-11). `YamlEditor` is always mounted
 *  with a STABLE `readOnly={false}` here (never flips) per client
 *  INSIGHTS.md's CodeMirror-recreation note. */
export function PreviewStep({
  files,
  isLoading,
  isError,
  workflowPath,
  workflowText,
  onWorkflowChange,
  parseError,
  lintWarnings,
}: {
  files: CiFile[];
  isLoading: boolean;
  isError: boolean;
  workflowPath: string | undefined;
  workflowText: string;
  onWorkflowChange: (value: string) => void;
  parseError: string | null;
  lintWarnings: string[];
}) {
  const t = useTranslations("ci");
  const [selectedPath, setSelectedPath] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (selectedPath == null && files.length > 0) setSelectedPath(files[0]!.path);
  }, [files, selectedPath]);

  if (isLoading) {
    return <div style={s.previewLoading}>{t("exportWizard.generating")}</div>;
  }
  if (isError) {
    return <div style={s.error}>Couldn&apos;t generate the preview.</div>;
  }

  const selected = files.find((f) => f.path === selectedPath) ?? files[0];
  const isWorkflow = !!selected && selected.path === workflowPath;

  return (
    <div style={s.previewGrid}>
      <div style={s.fileList}>
        <div style={s.fileListLabel}>{t("exportWizard.filesToCreate")}</div>
        {files.map((f) => (
          <button
            key={f.path}
            type="button"
            style={{ ...s.fileItem, ...(f.path === selected?.path ? s.fileItemActive : {}) }}
            onClick={() => setSelectedPath(f.path)}
          >
            <Icon.File size={13} />
            {f.path}
          </button>
        ))}
      </div>
      <div style={s.fileView}>
        {selected && (
          <>
            <div style={s.fileViewHeader}>
              <span className="mono" style={s.fileViewPath}>
                {selected.path}
              </span>
              {isWorkflow && (
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                  {t("exportWizard.editable")}
                </Badge>
              )}
            </div>
            {isWorkflow ? (
              <YamlEditor value={workflowText} onChange={onWorkflowChange} readOnly={false} />
            ) : (
              <pre style={s.readOnlyPre} className="mono">
                {selected.contents}
              </pre>
            )}
            {isWorkflow && parseError && (
              <div style={s.parseError} role="alert">
                {parseError}
              </div>
            )}
            {isWorkflow && !parseError && lintWarnings.length > 0 && (
              <div style={s.lintWarning} role="status">
                {lintWarnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
