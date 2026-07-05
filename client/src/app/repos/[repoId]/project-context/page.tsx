"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, ErrorState, Button } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useContextFiles, useReindexContext } from "@/lib/hooks/context-files";
import { useActiveRepo } from "@/lib/contexts";
import { ContextDocList } from "@/components/context/ContextDocList";
import { ContextDocPreview } from "@/components/context/ContextDocPreview";
import { ContextStatusFooter } from "@/components/context/ContextStatusFooter";

/**
 * /repos/:repoId/project-context — Project Context viewer.
 *
 * Left panel: list of all .md files found under specs/, docs/, insights/.
 * Center panel: markdown preview of the selected file.
 * Footer: doc count + token total + optional refreshed time + Reindex button.
 */
export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const { activeRepo } = useActiveRepo();
  const repoName = activeRepo?.full_name ?? repoId;

  const crumb = [
    { label: repoName, mono: true },
    { label: t("page.breadcrumb") },
  ];

  const { data: docs, isLoading, isError, refetch } = useContextFiles(repoId);

  const reindexMutation = useReindexContext();

  const [activeDoc, setActiveDoc] = React.useState<SpecFile | null>(null);
  /** Non-null only after Reindex was clicked in this browser session. */
  const [refreshedAt, setRefreshedAt] = React.useState<Date | null>(null);

  function handleReindex() {
    reindexMutation.mutate(repoId, {
      onSuccess: (data) => {
        setRefreshedAt(new Date(data.refreshed_at));
      },
    });
  }

  function handleDownload() {
    if (!activeDoc) return;
    const blob = new Blob([activeDoc.content ?? ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDoc.path.split("/").pop() ?? "document.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell crumb={crumb}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 52px)",
        }}
      >
        {/* Page header */}
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t("page.title")}</h1>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Left panel: doc list */}
          <div
            style={{
              width: 300,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-surface)",
            }}
          >
            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 10px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <Button
                kind="ghost"
                size="sm"
                icon="Plus"
                disabled
                title={t("page.toolbar.comingSoon")}
              />
              <Button
                kind="ghost"
                size="sm"
                icon="Folder"
                disabled
                title={t("page.toolbar.comingSoon")}
              />
              <Button
                kind="ghost"
                size="sm"
                icon="ArrowDown"
                disabled={!activeDoc}
                title={t("page.toolbar.download")}
                onClick={handleDownload}
              />
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                loading={reindexMutation.isPending}
                title={t("page.toolbar.reindex")}
                onClick={handleReindex}
              />
            </div>

            {/* File list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {isLoading ? (
                <div
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={24} />
                  ))}
                </div>
              ) : isError ? (
                <div style={{ padding: 16 }}>
                  <ErrorState
                    title={t("loadError")}
                    onRetry={() => refetch()}
                  />
                </div>
              ) : (docs ?? []).length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    icon="FileText"
                    title={t("empty.title")}
                    body={t("empty.body")}
                  />
                </div>
              ) : (
                <ContextDocList
                  docs={docs ?? []}
                  activeDoc={activeDoc}
                  onSelect={setActiveDoc}
                />
              )}
            </div>
          </div>

          {/* Center panel: markdown preview */}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            <ContextDocPreview doc={activeDoc} />
          </div>
        </div>

        {/* Footer */}
        <ContextStatusFooter docs={docs ?? []} refreshedAt={refreshedAt} />
      </div>
    </AppShell>
  );
}
