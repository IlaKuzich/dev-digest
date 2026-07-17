"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();

  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  if (isLoading || !versions) {
    return (
      <div style={s.list}>
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }

  const onRestore = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate(
      { id: skill.id, version },
      { onSuccess: (data) => toast.success(t("versions.restoredToast", { version, next: data.version })) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      <div style={s.list}>
        {versions.map((v) => {
          const isCurrent = v.version === skill.version;
          return (
            <div key={v.version} style={s.row(isCurrent)}>
              <Badge color={isCurrent ? "var(--accent)" : "var(--text-secondary)"} mono>
                {t("editor.version", { version: v.version })}
              </Badge>
              <div style={s.rowText}>
                <div style={s.note}>{v.note ?? t("versions.noNote")}</div>
                <div style={s.date}>{formatVersionDate(v.created_at)}</div>
              </div>
              {isCurrent ? (
                <span style={s.currentTag}>{t("versions.current")}</span>
              ) : (
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  onClick={() => onRestore(v.version)}
                  disabled={restore.isPending}
                >
                  {t("versions.restore")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
