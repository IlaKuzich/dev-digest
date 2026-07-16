"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import type { DraftPatch, SkillDraft } from "../../types";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function ConfigTab({
  draft,
  onDraft,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  draft: SkillDraft;
  onDraft: DraftPatch;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const t = useTranslations("skills");
  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`typeOptions.${v}`) }));

  return (
    <div style={s.form}>
      <FormField label={t("editor.name")} required>
        <TextInput value={draft.name} onChange={(v) => onDraft({ name: v })} />
      </FormField>
      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
        <TextInput value={draft.description} onChange={(v) => onDraft({ description: v })} />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => onDraft({ type: v as SkillType })}
          options={typeOptions}
        />
      </FormField>
      <FormField label={t("editor.body")} hint={t("editor.bodyHint")}>
        <Textarea value={draft.body} onChange={(v) => onDraft({ body: v })} rows={18} mono />
      </FormField>
      <FormField label={t("editor.note")} hint={t("editor.noteHint")}>
        <TextInput
          value={draft.note}
          onChange={(v) => onDraft({ note: v })}
          placeholder={t("editor.notePlaceholder")}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={onSave} disabled={saving}>
          {saving ? t("editor.saving") : t("editor.save")}
        </Button>
        <Button kind="ghost" icon="Trash" onClick={onDelete} disabled={deleting}>
          {t("editor.delete")}
        </Button>
      </div>
    </div>
  );
}
