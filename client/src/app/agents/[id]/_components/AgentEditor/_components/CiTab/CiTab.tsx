"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useCiInstallations, useUpdateCiConfig } from "@/lib/hooks/ci";
import { useToast } from "@/lib/toast";
import { ExportWizard } from "../ExportWizard";
import { FailCiOnSelect } from "./FailCiOnSelect";
import { InstallationRow } from "./InstallationRow";
import { s } from "./styles";

/** CI tab (Section C, mockup `ci-tab-repo-list.png`) — "Active in N repos",
 *  one row per installation, "+ Add to CI" / "+ Add repository" (both open
 *  the Export Wizard, AC-8), "Update CI config" (disabled + tooltip when no
 *  installs, AC-43), and the "Fail CI on" policy selector (AC-19). */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const toast = useToast();
  const { data, isLoading, isError } = useCiInstallations(agent.id);
  const updateConfig = useUpdateCiConfig();
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const activeCount = data?.active_count ?? 0;
  const installations = data?.installations ?? [];
  const noInstalls = activeCount === 0;

  const onUpdateConfig = () => {
    if (noInstalls || updateConfig.isPending) return;
    updateConfig.mutate(
      { agentId: agent.id, patch: {} },
      { onSuccess: () => toast.success(t("ciTab.updateConfig")) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("ciTab.ciDeployment")}</h2>
        <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
          {t("ciTab.activeInRepos", { count: activeCount })}
        </Badge>
        <div style={s.headerActions}>
          <span title={noInstalls ? t("ciTab.updateDisabledTooltip") : undefined}>
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={onUpdateConfig}
              disabled={noInstalls || updateConfig.isPending}
            >
              {t("ciTab.updateConfig")}
            </Button>
          </span>
          <Button kind="primary" icon="Plus" onClick={() => setWizardOpen(true)}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      </div>

      <FailCiOnSelect agent={agent} />

      {isLoading ? (
        <div style={s.list}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : isError ? (
        <EmptyState icon="AlertTriangle" title="Couldn't load CI installations" />
      ) : (
        <div style={s.list}>
          {installations.map((row) => (
            <InstallationRow key={row.id} row={row} />
          ))}
          <button type="button" style={s.addRow} onClick={() => setWizardOpen(true)}>
            <Icon.Plus size={14} />
            {t("ciTab.addRepository")}
          </button>
        </div>
      )}

      {wizardOpen && <ExportWizard agent={agent} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
