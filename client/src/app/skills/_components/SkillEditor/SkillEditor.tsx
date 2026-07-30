/* SkillEditor — tab shell for the skill editor. Fully controlled and
   URL-agnostic: SkillEditorView owns `?tab=` and the draft, which keeps this
   component (and its tests) free of next/navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextAttachTab } from "@/components/context-attach";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import type { DraftPatch, SkillDraft } from "./types";
import { s } from "./styles";

export function SkillEditor({
  skill,
  draft,
  onDraft,
  tab,
  onTab,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  skill: Skill;
  draft: SkillDraft;
  onDraft: DraftPatch;
  tab: string;
  onTab: (t: string) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const t = useTranslations("skills");
  // The "context" tab's label is a literal, not `t(labelKey)` under `skills` —
  // `messages/en/skills.json` is out of this task's file ownership, and
  // pulling a SECOND `useTranslations("contextAttach")` in here to resolve it
  // would require every existing SkillEditor test (not owned by this task
  // either) to also carry that namespace's messages, which they don't — see
  // the note on TABS in ./constants.ts.
  const tabs = TABS.map((tb) => ({
    key: tb.key,
    label: tb.key === "context" ? "Context" : t(tb.labelKey),
    icon: tb.icon,
  }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "preview" ? (
          <PreviewTab body={draft.body} />
        ) : tab === "versions" ? (
          <VersionsTab skill={skill} />
        ) : tab === "context" ? (
          <ContextAttachTab owner={{ kind: "skill", id: skill.id }} />
        ) : (
          <ConfigTab
            draft={draft}
            onDraft={onDraft}
            onSave={onSave}
            onDelete={onDelete}
            saving={saving}
            deleting={deleting}
          />
        )}
      </div>
    </div>
  );
}
