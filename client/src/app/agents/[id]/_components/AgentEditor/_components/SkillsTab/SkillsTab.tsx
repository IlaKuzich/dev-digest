"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { mergeSkillsWithLinks, reorder, type SkillRowState } from "./helpers";
import { s } from "./styles";

/** Agent editor "Skills" tab — merge, drag-reorder, per-agent enable, save. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setAgentSkills = useSetAgentSkills();

  const [rows, setRows] = React.useState<SkillRowState[]>([]);
  const [filter, setFilter] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!skills || !links) return;
    setRows(mergeSkillsWithLinks(skills, links));
  }, [skills, links]);

  const enabledCount = rows.filter((r) => r.enabled).length;

  const toggle = (skillId: string, enabled: boolean) =>
    setRows((prev) => prev.map((r) => (r.skill.id === skillId ? { ...r, enabled } : r)));

  const onDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    setRows((prev) => reorder(prev, dragIndex, dropIndex));
    setDragIndex(null);
  };

  const save = () =>
    setAgentSkills.mutate(
      { agentId: agent.id, links: rows.map((r) => ({ skill_id: r.skill.id, enabled: r.enabled })) },
      { onSuccess: () => toast.success(t("skills.savedToast")) },
    );

  // Filter is display-only; drag/drop and toggles still act on the real
  // index within `rows` so reordering stays correct while filtering.
  const visible = rows
    .map((r, i) => ({ row: r, index: i }))
    .filter(({ row }) => row.skill.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: enabledCount, total: rows.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filter}
      />
      <div style={s.list}>
        {visible.map(({ row, index }) => (
          <div
            key={row.skill.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(index)}
            style={s.row}
          >
            <Icon.Menu size={14} style={s.dragHandle} />
            <Checkbox checked={row.enabled} onChange={(v) => toggle(row.skill.id, v)} />
            <span style={s.name}>{row.skill.name}</span>
            <Badge color="var(--text-secondary)">{row.skill.type}</Badge>
          </div>
        ))}
      </div>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setAgentSkills.isPending}>
          {setAgentSkills.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>
    </div>
  );
}
