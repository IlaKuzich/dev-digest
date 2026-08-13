/* CompareModal — old→new metric deltas + system-prompt diff + Promote
   (AC-27/28/29/30). Opened from AgentDetail once exactly two runs are
   selected (AC-26). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import { useEvalCompare, usePromoteVersion } from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import { computeLineDiff, formatCompareDelta, formatCompareValue } from "./helpers";
import { diffLineStyle, s } from "./styles";

export interface CompareModalProps {
  agentId: string;
  batchA: string;
  batchB: string;
  onClose: () => void;
}

interface TileConfig {
  key: string;
  label: string;
  old: number | null;
  neu: number | null;
  delta: number | null;
  isPercent: boolean;
  colorByDirection: boolean;
}

function CompareTile({ tile }: { tile: TileConfig }) {
  const { text: deltaText, direction } = formatCompareDelta(tile.delta, tile.isPercent);
  const deltaColor = !tile.colorByDirection
    ? "var(--text-secondary)"
    : direction === "up"
      ? "var(--ok)"
      : direction === "down"
        ? "var(--crit)"
        : "var(--text-muted)";
  const DeltaIcon = direction === "up" ? Icon.ArrowUp : direction === "down" ? Icon.ArrowDown : Icon.Slash;
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{tile.label}</div>
      <div style={s.tileRow}>
        <span style={s.oldValue}>{formatCompareValue(tile.old, tile.isPercent)}</span>
        <Icon.ArrowRight size={12} style={{ color: "var(--text-muted)" }} />
        <span style={s.newValue}>{formatCompareValue(tile.neu, tile.isPercent)}</span>
        {tile.delta != null && (
          <span style={{ ...s.delta, color: deltaColor }}>
            <DeltaIcon size={11} />
            {deltaText}
          </span>
        )}
      </div>
    </div>
  );
}

export function CompareModal({ agentId, batchA, batchB, onClose }: CompareModalProps) {
  const t = useTranslations("eval");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useEvalCompare(agentId, batchA, batchB);
  const promote = usePromoteVersion(agentId);

  const onPromote = () => {
    if (!data) return;
    const version = data.b.agent_version;
    if (!window.confirm(t("promote.confirmTitle", { version }))) return;
    promote.mutate(
      { version },
      {
        onSuccess: () => {
          toast.success(t("promote.success", { version }));
          onClose();
        },
      },
    );
  };

  if (isLoading || !data) {
    if (isError) {
      return (
        <Modal title="Compare runs" onClose={onClose}>
          <div style={{ padding: 24 }}>
            <ErrorState body="Could not load this comparison." onRetry={() => refetch()} />
          </div>
        </Modal>
      );
    }
    return (
      <Modal title={t("dashboard.loading")} onClose={onClose}>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height={90} />
          <Skeleton height={180} />
        </div>
      </Modal>
    );
  }

  const tiles: TileConfig[] = [
    {
      key: "recall",
      label: t("compare.recall"),
      old: data.recall.old,
      neu: data.recall.new,
      delta: data.recall.delta,
      isPercent: true,
      colorByDirection: true,
    },
    {
      key: "precision",
      label: t("compare.precision"),
      old: data.precision.old,
      neu: data.precision.new,
      delta: data.precision.delta,
      isPercent: true,
      colorByDirection: true,
    },
    {
      key: "citation",
      label: t("compare.citationAccuracy"),
      old: data.citation_accuracy.old,
      neu: data.citation_accuracy.new,
      delta: data.citation_accuracy.delta,
      isPercent: true,
      colorByDirection: true,
    },
    {
      key: "cost",
      label: t("compare.cost"),
      old: data.cost.old,
      neu: data.cost.new,
      delta: data.cost.delta,
      isPercent: false,
      colorByDirection: false,
    },
  ];

  const oldPrompt = data.old_config?.system_prompt ?? null;
  const newPrompt = data.new_config?.system_prompt ?? null;
  const diff = oldPrompt != null && newPrompt != null ? computeLineDiff(oldPrompt, newPrompt) : null;

  return (
    <Modal
      width={780}
      title={t("compare.title", { oldVersion: data.a.agent_version, newVersion: data.b.agent_version })}
      subtitle={t("compare.subtitle", { total: data.b.traces_total || data.a.traces_total })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("compare.close")}
          </Button>
          <Button kind="primary" icon="GitBranch" loading={promote.isPending} onClick={onPromote}>
            {t("promote.button", { version: data.b.agent_version })}
          </Button>
        </div>
      }
    >
      <div style={s.tiles}>
        {tiles.map((tile) => (
          <CompareTile key={tile.key} tile={tile} />
        ))}
      </div>

      <div style={s.diffSection}>
        <div style={s.tileLabel}>{t("compare.promptDiffHeading")}</div>
        <div style={s.diffLegend}>
          <span style={s.diffLegendOld}>{t("compare.oldLabel", { version: data.a.agent_version })}</span>
          <span style={s.diffLegendNew}>{t("compare.newLabel", { version: data.b.agent_version })}</span>
        </div>
        {diff ? (
          <div style={s.diffBox} className="mono">
            {diff.map((op, i) => (
              <div key={i} style={diffLineStyle(op.type)}>
                {op.text || " "}
              </div>
            ))}
          </div>
        ) : (
          <div style={s.diffUnavailable}>Prompt diff unavailable — one of these runs has no recorded version config.</div>
        )}
      </div>
    </Modal>
  );
}
