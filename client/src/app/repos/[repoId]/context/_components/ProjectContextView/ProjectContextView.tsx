/* ProjectContextView — /repos/:repoId/context. Read-only discovery of every
   Markdown document under the repo's specs/docs/insights roots (AC-1), with a
   Preview affordance (AC-6) and a footer naming the document count, aggregate
   token estimate, and the age of the last-synced clone (AC-4). No edit,
   create, upload, or delete affordance ships here — attaching documents to an
   agent/skill is the Context tab (T6), not this page.

   All server state flows through `useContextDocs`/`useContextDocContent`
   (lib/hooks/context.ts) — this component never calls fetch/api.ts directly. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  EmptyState,
  ErrorState,
  IconBtn,
  Markdown,
  Modal,
  Skeleton,
} from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useContextDocContent, useContextDocs } from "@/lib/hooks/context";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { ApiError } from "@/lib/api";
import { CONTEXT_ROOTS_DISPLAY, SKELETON_ROWS } from "./constants";
import { aggregateTokenEstimate, docDirectory, docFilename, isCloneAbsent, timeSinceLabel } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useContextDocs(repoId);
  const resync = useResyncRepoIntel(repoId);

  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const preview = useContextDocContent(repoId, previewPath);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName ?? "", mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.pageHeader}>
          <h1 style={s.pageTitle}>{t("title")}</h1>
        </div>
        <div style={s.loadingStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={32} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError || data == null) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          title={t("loadError")}
          body={error instanceof ApiError ? error.message : t("loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  // Both possible empty-branch reasons are read here, ABOVE the early return
  // below — clone-absent (nothing to discover, AC-2) vs. roots-empty
  // (something was discoverable but nothing matched, AC-3). Each needs its
  // own copy and the clone-absent one needs its own action (Resync); deciding
  // which to render only inside a generic "no docs" branch is exactly the
  // mistake this must avoid (client/INSIGHTS.md:32).
  const cloneAbsent = isCloneAbsent(data.clone);
  const lastSynced = timeSinceLabel(data.clone.synced_at);

  if (data.docs.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.pageHeader}>
          <h1 style={s.pageTitle}>{t("title")}</h1>
        </div>
        <div style={s.emptyCard}>
          {cloneAbsent ? (
            <EmptyState
              icon="GitBranch"
              title={t("empty.noClone.title")}
              body={t("empty.noClone.body")}
              cta={t("resync")}
              onCta={() => resync.mutate()}
              ctaLoading={resync.isPending}
            />
          ) : (
            <EmptyState
              icon="FileText"
              title={t("empty.title")}
              body={t("empty.body", { roots: CONTEXT_ROOTS_DISPLAY.join(", ") })}
            />
          )}
        </div>
      </AppShell>
    );
  }

  const totalTokens = aggregateTokenEstimate(data.docs);

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>{t("title")}</h1>
      </div>

      <div style={s.tableCard}>
        {data.docs.map((doc) => (
          <div key={doc.path} style={s.row}>
            <div style={s.rowMain}>
              <span style={s.rowFilename}>{docFilename(doc.path)}</span>
              <span style={s.rowDir}>{docDirectory(doc.path) || "/"}</span>
            </div>
            <Badge>{t(`root.${doc.root}`)}</Badge>
            <span style={s.usedBy}>{t("usedBy", { count: doc.used_by_agents })}</span>
            <IconBtn
              icon="Eye"
              label={t("preview", { name: docFilename(doc.path) })}
              onClick={() => setPreviewPath(doc.path)}
            />
          </div>
        ))}
      </div>

      <div style={s.footer}>
        <span>{t("footer.docsCount", { count: data.docs.length })}</span>
        <span>{t("footer.tokensApprox", { count: totalTokens })}</span>
        <span>{lastSynced ? t("footer.lastSynced", { time: lastSynced }) : t("footer.lastSyncedUnknown")}</span>
      </div>

      {previewPath && (
        <Modal
          title={docFilename(previewPath)}
          subtitle={previewPath}
          onClose={() => setPreviewPath(null)}
        >
          <div style={s.previewBody}>
            {preview.isLoading ? (
              <Skeleton height={200} />
            ) : preview.isError ? (
              <ErrorState title={t("loadError")} onRetry={() => preview.refetch()} />
            ) : (
              <Markdown>{preview.data?.text}</Markdown>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
