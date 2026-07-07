/* EvalCaseModal — create/edit an eval case. Prefilled either blank ("New
   case") or from a `EvalCaseInput` returned by the "Turn into eval case"
   finding flow (AC-9). Shows a computed (not stored) POSITIVE/NEGATIVE
   banner derived from `expected_output.length` (AC-10). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, Badge, Tabs, Icon } from "@devdigest/ui";
import { TextInput, Textarea, FormField } from "@devdigest/ui";
import type { EvalCase, EvalCaseInput, EvalOwnerKind } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useUpdateEvalCase,
  useRunEvalCase,
} from "@/lib/hooks/evals";
import {
  caseTypeOf,
  tryParseExpectedOutput,
  stringifyExpectedOutput,
} from "./helpers";

interface InputMeta {
  pr_title?: string;
  pr_body?: string;
}

function readInputMeta(meta: unknown): InputMeta {
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    return {
      pr_title: typeof m.pr_title === "string" ? m.pr_title : "",
      pr_body: typeof m.pr_body === "string" ? m.pr_body : "",
    };
  }
  return { pr_title: "", pr_body: "" };
}

export function EvalCaseModal({
  ownerKind,
  ownerId,
  initial,
  prefill,
  onClose,
  onSaved,
}: {
  /** Required for a blank "New case" (EvalsTab already knows its owner).
   *  Optional when `initial`/`prefill` is given — the owner is then read off
   *  that record (the findings-prefill endpoint resolves it server-side). */
  ownerKind?: EvalOwnerKind;
  ownerId?: string;
  /** Editing an existing persisted case. */
  initial?: EvalCase | null;
  /** Creating a new case, prefilled from "Turn into eval case" (AC-9). */
  prefill?: EvalCaseInput | null;
  onClose: () => void;
  onSaved?: (c: EvalCase) => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const tc = useTranslations("common");

  const source = initial ?? prefill ?? null;
  const initialMeta = readInputMeta(source?.input_meta);
  const resolvedOwnerKind = initial?.owner_kind ?? prefill?.owner_kind ?? ownerKind;
  const resolvedOwnerId = initial?.owner_id ?? prefill?.owner_id ?? ownerId;

  const [name, setName] = React.useState(
    (initial?.name ?? (prefill as EvalCaseInput | null)?.name) || "",
  );
  const [inputTab, setInputTab] = React.useState<"diff" | "prMeta">("diff");
  const [diffText, setDiffText] = React.useState(source?.input_diff ?? "");
  const [prTitle, setPrTitle] = React.useState(initialMeta.pr_title ?? "");
  const [prBody, setPrBody] = React.useState(initialMeta.pr_body ?? "");
  const [expectedText, setExpectedText] = React.useState(
    stringifyExpectedOutput(source?.expected_output),
  );
  const [notes, setNotes] = React.useState(source?.notes ?? "");

  const parsedExpected = tryParseExpectedOutput(expectedText);
  const invalidJson = parsedExpected === null;
  const caseType = caseTypeOf(parsedExpected ?? []);

  const createCase = useCreateEvalCase();
  const updateCase = useUpdateEvalCase();
  const runCase = useRunEvalCase();

  const saving = createCase.isPending || updateCase.isPending;
  const isEditing = !!initial?.id;

  function buildInputMeta(): InputMeta | undefined {
    if (!prTitle && !prBody) return undefined;
    return { pr_title: prTitle || undefined, pr_body: prBody || undefined };
  }

  function handleSave() {
    if (invalidJson) return;
    if (isEditing && initial) {
      updateCase.mutate(
        {
          id: initial.id,
          patch: {
            name,
            input_diff: diffText,
            input_meta: buildInputMeta(),
            expected_output: parsedExpected,
            notes: notes || undefined,
          },
        },
        {
          onSuccess: (data) => {
            onSaved?.(data);
            onClose();
          },
        },
      );
    } else {
      if (!resolvedOwnerKind || !resolvedOwnerId) return;
      createCase.mutate(
        {
          owner_kind: resolvedOwnerKind,
          owner_id: resolvedOwnerId,
          name,
          input_diff: diffText,
          input_meta: buildInputMeta(),
          expected_output: parsedExpected,
          notes: notes || undefined,
        },
        {
          onSuccess: (data) => {
            onSaved?.(data);
            onClose();
          },
        },
      );
    }
  }

  return (
    <Modal
      width={720}
      title={isEditing ? t("caseTitle", { name: initial?.name }) : t("newCase")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            {isEditing && initial && resolvedOwnerKind && resolvedOwnerId && (
              <Button
                kind="secondary"
                size="sm"
                icon="Play"
                loading={runCase.isPending}
                onClick={() =>
                  runCase.mutate({
                    id: initial.id,
                    ownerKind: resolvedOwnerKind,
                    ownerId: resolvedOwnerId,
                  })
                }
              >
                {runCase.isPending ? t("running") : t("runCase")}
              </Button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button kind="ghost" size="sm" onClick={onClose}>
              {tc("actions.cancel")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              disabled={invalidJson || !name || saving}
              loading={saving}
              onClick={handleSave}
            >
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <Badge
            color={caseType === "must_find" ? "var(--ok)" : "var(--warn)"}
            bg={caseType === "must_find" ? "var(--ok-bg)" : "var(--warn-bg)"}
            icon={caseType === "must_find" ? "CheckCircle" : "AlertTriangle"}
          >
            {caseType === "must_find" ? t("positiveBanner") : t("negativeBanner")}
          </Badge>
        </div>

        <FormField label={t("nameLabel")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("namePlaceholder")}
          />
        </FormField>

        <FormField label={t("inputLabel")}>
          <Tabs
            tabs={[
              { key: "diff", label: t("tabs.diff") },
              { key: "prMeta", label: t("tabs.prMeta") },
            ]}
            value={inputTab}
            onChange={(k) => setInputTab(k as "diff" | "prMeta")}
            pad="0"
          />
          <div style={{ marginTop: 12 }}>
            {inputTab === "diff" ? (
              <Textarea
                value={diffText}
                onChange={setDiffText}
                placeholder={t("diffPlaceholder")}
                rows={8}
                mono
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label={t("titleLabel")}>
                  <TextInput
                    value={prTitle}
                    onChange={setPrTitle}
                    placeholder={t("titlePlaceholder")}
                  />
                </FormField>
                <FormField label={t("bodyLabel")}>
                  <Textarea
                    value={prBody}
                    onChange={setPrBody}
                    placeholder={t("bodyPlaceholder")}
                    rows={4}
                  />
                </FormField>
              </div>
            )}
          </div>
        </FormField>

        <FormField
          label={t("expectedOutput")}
          right={
            <span
              style={{
                fontSize: 12,
                color: invalidJson ? "var(--crit)" : "var(--ok)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon.Dot size={10} />
              {invalidJson ? t("invalidJson") : t("validJson")}
            </span>
          }
        >
          <Textarea
            value={expectedText}
            onChange={setExpectedText}
            rows={6}
            mono
          />
        </FormField>

        <FormField label={t("notesLabel")}>
          <Textarea
            value={notes}
            onChange={setNotes}
            placeholder={t("notesPlaceholder")}
            rows={2}
          />
        </FormField>
      </div>
    </Modal>
  );
}
