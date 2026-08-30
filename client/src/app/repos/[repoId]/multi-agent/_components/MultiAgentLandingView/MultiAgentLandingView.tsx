/* MultiAgentLandingView — /repos/:repoId/multi-agent (no PR number).
   The global nav's "Multi-Agent Review" item lands HERE, not directly on
   Configure: it resolves the repo's LATEST multi-agent run (if any) and
   redirects to that PR's results page, falling back to Configure only when
   the repo has never had one. Fixes the bug where navigating to this feature
   always forced starting a brand-new run and offered no way back to a run
   already in progress or finished. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { useLatestMultiAgentRunForRepo } from "@/lib/hooks/multi-agent-results";
import { s } from "./styles";

export function MultiAgentLandingView() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const params = useParams<{ repoId: string }>();
  const { repoId } = params;
  const repoNotFound = useRepoNotFound(repoId);
  const { data: latest, isLoading, isError, refetch } = useLatestMultiAgentRunForRepo(repoId);

  const target =
    latest && latest.pr_number != null
      ? `/repos/${repoId}/multi-agent/${latest.pr_number}`
      : `/repos/${repoId}/multi-agent/configure`;

  React.useEffect(() => {
    if (!isLoading && !isError) router.replace(target);
  }, [isLoading, isError, target, router]);

  const crumb = [{ label: t("configure.breadcrumbFeature") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState
            title={t("results.errorTitle")}
            onRetry={() => refetch()}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Skeleton height={28} width={320} />
        <Skeleton height={16} width={240} />
        <Skeleton height={160} />
      </div>
    </AppShell>
  );
}
