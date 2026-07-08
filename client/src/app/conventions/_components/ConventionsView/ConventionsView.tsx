"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useActiveRepo } from "../../../../lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "../../../../lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateConventionSkillModal } from "./_components/CreateConventionSkillModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo } = useActiveRepo();
  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [creating, setCreating] = React.useState(false);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const visible = (conventions ?? []).filter((c) => c.status !== "rejected");
  const accepted = visible.filter((c) => c.status === "accepted");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      {creating && repoId && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          accepted={accepted}
          onClose={() => setCreating(false)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>
            {t("page.headingPrefix")}
            <span style={s.repoName}>{repoName}</span>
          </h1>
          <p style={s.subtitle}>{t("page.subtitle")}</p>
        </div>

        {!repoId && <EmptyState icon="Sparkles" title={t("page.noRepo")} />}

        {repoId && (
          <>
            <div style={s.toolbar}>
              <div style={s.toolbarLeft}>
                {extract.data && (
                  <span>{t("page.detectedFrom", { count: extract.data.scan.sample_count })}</span>
                )}
                <span>
                  {t("page.acceptedCount", { accepted: accepted.length, total: visible.length })}
                </span>
              </div>
              <div style={s.toolbarRight}>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="RefreshCw"
                  onClick={() => extract.mutate()}
                  disabled={extract.isPending}
                >
                  {extract.isPending ? t("page.scanning") : t("page.rescan")}
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Sparkles"
                  onClick={() => setCreating(true)}
                  disabled={accepted.length === 0}
                >
                  {t("page.createSkill")}
                </Button>
              </div>
            </div>

            {extract.isError && (
              <ErrorState body={t("page.extractionFailed")} onRetry={() => extract.mutate()} />
            )}
            {isLoading && (
              <div style={s.list}>
                <Skeleton height={120} />
                <Skeleton height={120} />
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && visible.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
                onCta={() => extract.mutate()}
                ctaLoading={extract.isPending}
              />
            )}
            {visible.length > 0 && (
              <div style={s.list}>
                {visible.map((c) => (
                  <ConventionCard
                    key={c.id}
                    convention={c}
                    onAccept={() => update.mutate({ id: c.id, patch: { status: "accepted" } })}
                    onReject={() => update.mutate({ id: c.id, patch: { status: "rejected" } })}
                    onEdit={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
