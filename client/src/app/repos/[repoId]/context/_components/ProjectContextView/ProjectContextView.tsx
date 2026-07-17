/* ProjectContextView — /repos/:repoId/context. Read-only discovery of every
   Markdown document under the repo's specs/docs/insights roots (AC-1).

   Layout is a two-pane master-detail (see the mockup at
   specs/assets/2026-07-17-project-context/project-context.png, mirrored on the
   Skills workbench): a left file-list column and a right pane that previews the
   selected document INLINE (AC-6) — no modal. A footer names the document
   count, aggregate token estimate, and the age of the last-synced clone (AC-4).
   No edit, create, upload, or delete affordance ships here — attaching
   documents to an agent/skill is the Context tab (T6), not this page.

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
  Icon,
  IconBtn,
  Markdown,
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

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const preview = useContextDocContent(repoId, selectedPath);

  // The mockup opens on the first document — auto-select it once the list
  // loads, and keep the current selection if it's still in the list.
  React.useEffect(() => {
    const docs = data?.docs ?? [];
    const first = docs[0];
    if (!first) return;
    setSelectedPath((cur) => (cur && docs.some((d) => d.path === cur) ? cur : first.path));
  }, [data]);

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
  const selectedDoc = data.docs.find((d) => d.path === selectedPath) ?? null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.row}>
        {/* LEFT — file list */}
        <div style={s.listCol}>
          <div style={s.listHeader}>
            <div style={s.titleRow}>
              <h1 style={s.listLabel}>{t("title")}</h1>
              {/* The one toolbar action that survives the resync clobber: a
                  manual resync. Create/upload/new-folder are deliberately out
                  (spec Non-goals — writes into a git-reset-hard'd clone). */}
              <IconBtn
                icon="RefreshCw"
                label={t("resync")}
                onClick={() => {
                  if (!resync.isPending) resync.mutate();
                }}
              />
            </div>
            <div style={s.roots}>{CONTEXT_ROOTS_DISPLAY.map((r) => `${t(`root.${r}`)}/`).join(" · ")}</div>
          </div>

          <div style={s.listScroll}>
            {data.docs.map((doc) => {
              const selected = doc.path === selectedPath;
              const dir = docDirectory(doc.path);
              return (
                <button
                  key={doc.path}
                  type="button"
                  onClick={() => setSelectedPath(doc.path)}
                  aria-current={selected}
                  style={selected ? s.docRowSelected : s.docRow}
                >
                  <Icon.FileText size={14} style={s.docIcon} />
                  <span style={s.docMain}>
                    <span style={s.docFilename}>{docFilename(doc.path)}</span>
                    {dir && <span style={s.docDir}>{dir}</span>}
                  </span>
                  <Badge>{t(`root.${doc.root}`)}</Badge>
                </button>
              );
            })}
          </div>

          <div style={s.listFooter}>
            <div style={s.footerLine}>
              <span style={s.footerDot} />
              <span>{t("footer.docsCount", { count: data.docs.length })}</span>
              <span style={s.footerSep}>·</span>
              <span>{t("footer.tokensApprox", { count: totalTokens })}</span>
            </div>
            <span>{lastSynced ? t("footer.lastSynced", { time: lastSynced }) : t("footer.lastSyncedUnknown")}</span>
          </div>
        </div>

        {/* RIGHT — inline preview of the selected document */}
        <div style={s.pane}>
          {selectedDoc ? (
            <>
              <div style={s.detailHeader}>
                <span style={s.detailFilename}>{docFilename(selectedDoc.path)}</span>
                {/* Preview-only: editing is a spec Non-goal (resync clobber). */}
                <span style={s.previewPill}>{t("mode.preview")}</span>
                <span style={s.detailUsedBy}>{t("usedBy", { count: selectedDoc.used_by_agents })}</span>
              </div>
              <div style={s.detailBody}>
                {preview.isLoading ? (
                  <Skeleton height={200} />
                ) : preview.isError ? (
                  <ErrorState title={t("loadError")} onRetry={() => preview.refetch()} />
                ) : (
                  <Markdown>{preview.data?.text}</Markdown>
                )}
              </div>
            </>
          ) : (
            <div style={s.paneEmpty}>
              <Icon.FileText size={20} style={s.docIcon} />
              <p style={s.paneEmptyBody}>{t("selectPrompt")}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
