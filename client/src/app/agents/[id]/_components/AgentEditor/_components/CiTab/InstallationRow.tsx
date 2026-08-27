"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiInstallationRow } from "@devdigest/shared";
import { relativeTimeFrom } from "@/lib/format-relative-time";
import { statusI18nKey, statusStyle, targetLabel } from "./helpers";
import { s } from "./styles";

/** One installed-repo row (AC-18). Static display only — no nested
 *  interactive elements, so the nested-interactive rule (client
 *  INSIGHTS.md:62) doesn't apply here (that's only for rows that ALSO carry
 *  their own action buttons; this row carries none). */
export function InstallationRow({ row }: { row: CiInstallationRow }) {
  const t = useTranslations("ci");
  const ago = relativeTimeFrom(row.last_ran_at);
  const statusKey = row.last_run_status ? statusI18nKey(row.last_run_status) : null;
  const statusLabel = row.last_run_status
    ? statusKey
      ? t(`runs.status.${statusKey}`)
      : row.last_run_status
    : t("ciTab.noRuns");
  const style = statusStyle(row.last_run_status ?? "");

  return (
    <div style={s.row}>
      <span style={s.repo}>
        <Icon.GitBranch size={15} style={{ color: "var(--text-muted)" }} />
        {row.repo}
      </span>
      <div style={s.rowRight}>
        <Badge icon="Workflow">{targetLabel(row.target_type)}</Badge>
        {row.last_run_status ? (
          <Badge color={style.color} bg={style.bg} icon={style.icon} dot>
            {statusLabel}
          </Badge>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{statusLabel}</span>
        )}
        {ago && <span style={s.ranAt}>{ago}</span>}
      </div>
    </div>
  );
}
