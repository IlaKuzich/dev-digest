"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, Textarea, Markdown } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useCreateConventionSkill } from "../../../../../../lib/hooks/conventions";
import { buildDefaultSkillBody, repoSlug } from "./helpers";
import { ms } from "./styles";

/** Merge accepted conventions into one editable skill, then create it (source: extracted). */
export function CreateConventionSkillModal({
  repoId,
  repoName,
  accepted,
  onClose,
}: {
  repoId: string;
  repoName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const create = useCreateConventionSkill(repoId);
  const slug = repoSlug(repoName);

  const [name, setName] = React.useState(`${slug}-conventions`);
  const [description, setDescription] = React.useState(
    `${accepted.length} house conventions extracted from ${slug}`,
  );
  const [body, setBody] = React.useState(() => buildDefaultSkillBody(repoName, accepted));

  const submit = async () => {
    await create.mutateAsync({ name: name.trim() || `${slug}-conventions`, description, body });
    onClose();
  };

  return (
    <Modal
      width={720}
      title={t("modal.title")}
      subtitle={`${slug}-conventions`}
      onClose={onClose}
      footer={
        <div style={ms.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={create.isPending || body.trim().length === 0}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={ms.body}>
        <div style={ms.note}>
          {t("modal.mergedNote", { count: accepted.length, repo: slug })}
        </div>
        <FormField label={t("modal.name")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("modal.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("modal.body")} required>
          <Textarea value={body} onChange={setBody} rows={10} mono />
        </FormField>
        <div style={ms.preview}>
          <Markdown>{body}</Markdown>
        </div>
      </div>
    </Modal>
  );
}
