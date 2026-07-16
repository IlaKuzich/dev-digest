/* Skills workbench — rendered by BOTH /skills and /skills/:id. The route's `id`
   (absent on /skills) only decides what fills the right pane, so the skill list
   stays put while you move between skills. See
   docs/superpowers/specs/2026-07-16-skills-workbench-layout-design.md */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { SkillEditorPane } from "../SkillEditorPane";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsWorkbench() {
  const t = useTranslations("skills");
  const router = useRouter();
  const searchParams = useSearchParams();
  // No dynamic segment on /skills, so `id` is undefined there — that is the
  // whole selection mechanism.
  const params = useParams<{ id?: string }>();
  const selectedId = params?.id;

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Carry the open tab across skills, so switching skills keeps you on Versions.
  const tab = searchParams.get("tab") ?? "config";
  const list = filterSkills(skills ?? [], search);

  return (
    <AppShell crumb={[{ label: t("list.crumbLab") }, { label: t("list.crumb") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      <div style={s.row}>
        <div style={s.listCol}>
          <div style={s.listHeader}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("list.title")}</h1>
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
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("list.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>

          <div style={s.listScroll}>
            {isLoading && (
              <div style={s.listStates}>
                <Skeleton height={92} />
                <Skeleton height={92} />
                <Skeleton height={92} />
              </div>
            )}
            {isError && (
              <div style={s.listStates}>
                <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />
              </div>
            )}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("list.emptyTitle")}
                body={t("list.emptyBody")}
                cta={t("list.emptyCta")}
                onCta={() => setCreating(true)}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        <div style={s.pane}>
          {selectedId ? (
            <SkillEditorPane />
          ) : (
            <div style={s.paneEmpty}>
              <Icon.Sparkles size={20} style={{ color: "var(--text-muted)" }} />
              <h3 style={s.paneEmptyTitle}>{t("list.selectTitle")}</h3>
              <p style={s.paneEmptyBody}>{t("list.selectBody")}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
