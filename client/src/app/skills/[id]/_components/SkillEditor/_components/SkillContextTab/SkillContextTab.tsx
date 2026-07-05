"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, Markdown } from "@devdigest/ui";
import type { Skill, SpecFile } from "@devdigest/shared";
import { useContextFiles } from "@/lib/hooks/context-files";
import { useUpdateSkillContextPaths } from "@/lib/hooks/context-files";
import { useActiveRepo } from "@/lib/contexts";
import { ContextDocAttachList } from "@/components/context/ContextDocAttachList";

/**
 * SkillContextTab — project context section in the Skill editor.
 *
 * Mirrors the agent ContextTab but uses updateSkillContextPaths.
 */
export function SkillContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;

  const {
    data: allDocs,
    isLoading,
    isError,
    refetch,
  } = useContextFiles(repoId);

  const updatePaths = useUpdateSkillContextPaths();

  const [previewDoc, setPreviewDoc] = React.useState<SpecFile | null>(null);

  if (!repoId) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          {t("attach.noRepo")}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>
          {t("attach.noRepoHint")}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={24} />
        <Skeleton height={24} />
        <Skeleton height={24} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const docs = allDocs ?? [];

  function handleUpdate(newPaths: string[]) {
    updatePaths.mutate({ id: skill.id, paths: newPaths });
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left: doc list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 24px",
          borderRight: previewDoc ? "1px solid var(--border)" : undefined,
          minWidth: 0,
        }}
      >
        {docs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("attach.empty")}
          </p>
        ) : (
          <ContextDocAttachList
            allDocs={docs}
            attachedPaths={skill.context_doc_paths ?? []}
            onUpdate={handleUpdate}
            isPending={updatePaths.isPending}
            onPreview={setPreviewDoc}
          />
        )}
      </div>

      {/* Right: markdown preview */}
      {previewDoc && (
        <div
          style={{
            width: 360,
            flexShrink: 0,
            overflowY: "auto",
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--text-secondary)" }}
            >
              {previewDoc.path}
            </span>
            <button
              onClick={() => setPreviewDoc(null)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
          <Markdown>{previewDoc.content ?? ""}</Markdown>
        </div>
      )}
    </div>
  );
}
