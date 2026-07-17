"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton, Icon, Badge, Toggle } from "@devdigest/ui";
import { useSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { SkillEditor, type SkillDraft } from "../SkillEditor";
import { VALID_TABS } from "../SkillEditor/constants";
import { EMPTY_DRAFT } from "./constants";
import { s } from "./styles";

/* The right pane of the Skills workbench. Page chrome (AppShell, breadcrumb, the
   skill list) belongs to SkillsWorkbench — this renders the selected skill only. */
export function SkillEditorPane() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const t = useTranslations("skills");
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  // The draft lives here, above the tab switch, so unsaved edits survive
  // Config → Preview → Versions.
  const [draft, setDraft] = React.useState<SkillDraft>(EMPTY_DRAFT);
  const onDraft = (patch: Partial<SkillDraft>) => setDraft((d) => ({ ...d, ...patch }));

  React.useEffect(() => {
    if (!skill) return;
    setDraft({
      name: skill.name,
      description: skill.description,
      type: skill.type,
      body: skill.body,
      enabled: skill.enabled,
      note: "",
    });
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isError || (!isLoading && !skill)) {
    return (
      <div style={s.wrap}>
        <ErrorState
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading || !skill) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={240} />
        <Skeleton height={300} />
      </div>
    );
  }

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: {
          name: draft.name,
          description: draft.description,
          type: draft.type,
          body: draft.body,
          enabled: draft.enabled,
          // Only meaningful when the body changed; the server ignores it otherwise.
          ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
        },
      },
      {
        onSuccess: (data) => {
          toast.success(t("editor.savedToast", { version: data.version }));
          // The note describes one edit — don't carry it into the next save.
          onDraft({ note: "" });
        },
      },
    );

  const remove = () => {
    if (!window.confirm(t("editor.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
  };

  const toggleEnabled = (enabled: boolean) => {
    onDraft({ enabled });
    update.mutate({ id: skill.id, patch: { enabled } });
  };

  return (
    <div style={s.wrap}>
      <div style={s.titleRow}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.h1}>{skill.name}</h1>
        <Badge color="var(--text-secondary)" mono>
          {t("editor.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("editor.enabled")}
          <Toggle on={draft.enabled} onChange={toggleEnabled} size={16} />
        </label>
      </div>
      <SkillEditor
        skill={skill}
        draft={draft}
        onDraft={onDraft}
        tab={tab}
        onTab={setTab}
        onSave={save}
        onDelete={remove}
        saving={update.isPending}
        deleting={del.isPending}
      />
    </div>
  );
}
