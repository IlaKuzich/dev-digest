"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ErrorState,
  Skeleton,
  Icon,
  Badge,
  FormField,
  TextInput,
  SelectInput,
  Textarea,
  Toggle,
  Markdown,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function SkillEditorView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("skills");
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumb = [
    { label: t("list.crumbLab") },
    { label: t("list.crumb"), href: "/skills" },
    { label: skill?.name ?? t("editor.crumbFallback") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (isLoading || !skill) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.wrap}>
          <Skeleton height={24} width={240} />
          <Skeleton height={300} />
        </div>
      </AppShell>
    );
  }

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`typeOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
    );

  const remove = () => {
    if (!window.confirm(t("editor.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.header}>
          <button onClick={() => router.push("/skills")} style={s.backLink}>
            {t("editor.back")}
          </button>
        </div>
        <div style={s.titleRow}>
          <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
          <h1 style={s.h1}>{skill.name}</h1>
          <Badge color="var(--text-secondary)" mono>
            {t("editor.version", { version: skill.version })}
          </Badge>
          <label style={s.enabledLabel}>
            {t("editor.enabled")}
            <Toggle on={enabled} onChange={setEnabled} size={16} />
          </label>
        </div>
        <div style={s.grid}>
          <div style={s.form}>
            <FormField label={t("editor.name")} required>
              <TextInput value={name} onChange={setName} />
            </FormField>
            <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("editor.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            <FormField label={t("editor.body")} hint={t("editor.bodyHint")}>
              <Textarea value={body} onChange={setBody} rows={16} mono />
            </FormField>
            <div style={s.actions}>
              <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
                {update.isPending ? t("editor.saving") : t("editor.save")}
              </Button>
              {update.isSuccess && (
                <span style={s.savedNote}>{t("editor.saved", { version: update.data?.version })}</span>
              )}
              <Button kind="ghost" icon="Trash" onClick={remove} disabled={del.isPending}>
                {t("editor.delete")}
              </Button>
            </div>
          </div>
          <div style={s.preview}>
            <div style={s.previewLabel}>{t("editor.preview")}</div>
            <Markdown>{body}</Markdown>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
