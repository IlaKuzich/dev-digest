"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon, Badge, Markdown } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);
  const selected = list.find((sk) => sk.id === selectedId) ?? null;

  return (
    <AppShell crumb={[{ label: t("list.crumbLab") }, { label: t("list.crumb") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <div style={s.main}>
          <div style={s.header}>
            <div style={s.headerText}>
              <h1 style={s.h1}>{t("list.title")}</h1>
              <p style={s.subtitle}>{t("list.subtitle")}</p>
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("list.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("list.addSkill")}
                </Button>
              }
              items={[
                { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
                { divider: true },
                { label: t("list.importSoon"), icon: "Upload", muted: true, onClick: () => {} },
              ]}
            />
          </div>

          {isLoading && (
            <div style={s.grid}>
              <Skeleton height={120} />
              <Skeleton height={120} />
              <Skeleton height={120} />
            </div>
          )}
          {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && list.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("list.emptyTitle")}
              body={t("list.emptyBody")}
              cta={t("list.emptyCta")}
              onCta={() => setCreating(true)}
            />
          )}
          {list.length > 0 && (
            <div style={s.grid}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === selectedId}
                  onClick={() => setSelectedId(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                />
              ))}
            </div>
          )}
        </div>

        <div style={s.panel}>
          {!selected && (
            <div style={s.panelEmpty}>
              <Icon.Sparkles size={20} style={{ color: "var(--text-muted)" }} />
              <h3 style={s.panelEmptyTitle}>{t("list.selectTitle")}</h3>
              <p style={s.panelEmptyBody}>{t("list.selectBody")}</p>
            </div>
          )}
          {selected && (
            <div style={s.panelBody}>
              <div style={s.panelHeader}>
                <h2 style={s.panelTitle}>{selected.name}</h2>
                <Badge color="var(--text-secondary)">{t(`typeOptions.${selected.type}`)}</Badge>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="Edit"
                  onClick={() => router.push(`/skills/${selected.id}?tab=config`)}
                >
                  {t("preview.edit")}
                </Button>
              </div>
              <div style={s.panelDescription}>{selected.description}</div>
              <div style={s.panelMarkdown}>
                <Markdown>{selected.body}</Markdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
