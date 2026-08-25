"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Modal, Tabs, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { EvalCaseDraft, EvalCaseInput } from "@devdigest/shared";
import { formatCost } from "@/components/run-cost-badge";
import { expectedCount } from "@/lib/eval-case-helpers";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase, type EvalCaseWithLastRun } from "@/lib/hooks/eval-cases";
import { insertFindingSkeleton, tryParseJson } from "./helpers";

type InputTab = "diff" | "files" | "prMeta";

interface PrMeta {
  title: string;
  body: string;
}

function readPrMeta(input_meta: unknown): PrMeta {
  const meta = input_meta as { title?: unknown; body?: unknown } | null;
  return {
    title: typeof meta?.title === "string" ? meta.title : "",
    body: typeof meta?.body === "string" ? meta.body : "",
  };
}

function readInputFilesText(input_files: unknown): string {
  if (input_files == null) return "";
  try {
    return JSON.stringify(input_files, null, 2);
  } catch {
    return "";
  }
}

/** Best-effort: a valid-JSON Files tab body is stored parsed; otherwise the
    raw text is kept as-is (input_files is `z.unknown()` — no shape to enforce). */
function buildInputFiles(text: string): unknown {
  if (!text.trim()) return null;
  const parsed = tryParseJson(text);
  return parsed.valid ? parsed.value : text;
}

interface LastRunStrip {
  pass: boolean;
  expected: number;
  got: number;
  durationMs: number | null;
  costUsd: number | null;
}

function initialStrip(evalCase: EvalCaseWithLastRun | null): LastRunStrip | null {
  if (!evalCase?.last_run) return null;
  const out = evalCase.last_run.actual_output;
  return {
    pass: !!evalCase.last_run.pass,
    expected: expectedCount(evalCase),
    got: Array.isArray(out) ? out.length : 0,
    durationMs: evalCase.last_run.duration_ms,
    costUsd: evalCase.last_run.cost_usd,
  };
}

/**
 * Eval case editor modal (AC-13..16, screenshot 05): Name, Input (Diff/Files/
 * PR meta tabs), Expected-output JSON editor with a blocking valid/invalid
 * indicator, "+ Finding skeleton", "Run on save", and the result strip.
 *
 * Shared across 2+ routes: the Agent editor's Evals tab (create/edit an
 * existing case — `evalCase` set) and the PR review page's "Turn into eval
 * case" flow (a not-yet-persisted draft — `evalCase` is `null`, `initialValues`
 * pre-fills the form; nothing is written until Save).
 */
export function EvalCaseEditorModal({
  agentId,
  agentName,
  evalCase,
  initialValues = null,
  onClose,
}: {
  agentId: string;
  agentName: string;
  evalCase: EvalCaseWithLastRun | null;
  /** Pre-fills a brand-new (not yet persisted) case — ignored once `evalCase` is set. */
  initialValues?: Pick<EvalCaseDraft, "name" | "input_diff" | "expected_output"> | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const createCase = useCreateEvalCase(agentId);
  const updateCase = useUpdateEvalCase();
  const runCase = useRunEvalCase();

  const prMeta = readPrMeta(evalCase?.input_meta ?? null);

  const [name, setName] = React.useState(evalCase?.name ?? initialValues?.name ?? "");
  const [inputTab, setInputTab] = React.useState<InputTab>("diff");
  const [diffText, setDiffText] = React.useState(evalCase?.input_diff ?? initialValues?.input_diff ?? "");
  const [filesText, setFilesText] = React.useState(readInputFilesText(evalCase?.input_files));
  const [prTitle, setPrTitle] = React.useState(prMeta.title);
  const [prBody, setPrBody] = React.useState(prMeta.body);
  const [expectedText, setExpectedText] = React.useState(
    JSON.stringify((evalCase ? evalCase.expected_output : initialValues?.expected_output) ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [strip, setStrip] = React.useState<LastRunStrip | null>(initialStrip(evalCase));

  const parsedExpected = React.useMemo(() => tryParseJson(expectedText), [expectedText]);
  const saving = createCase.isPending || updateCase.isPending;
  const running = runCase.isPending;

  const runPersistedCase = async (caseId: string) => {
    const result = await runCase.mutateAsync(caseId);
    const trace = result.result.per_trace[0];
    const expectedFromEditor = parsedExpected.valid && Array.isArray(parsedExpected.value) ? parsedExpected.value.length : 0;
    setStrip({
      pass: trace ? trace.pass : result.result.traces_passed >= result.result.traces_total,
      expected: Array.isArray(trace?.expected) ? trace.expected.length : expectedFromEditor,
      got: Array.isArray(trace?.actual) ? trace.actual.length : 0,
      durationMs: result.result.duration_ms,
      costUsd: result.result.cost_usd,
    });
  };

  const save = async () => {
    if (!parsedExpected.valid) return;
    const payload: EvalCaseInput = {
      owner_kind: "agent",
      owner_id: agentId,
      name: name.trim(),
      input_diff: diffText,
      input_files: buildInputFiles(filesText),
      input_meta: { title: prTitle, body: prBody },
      expected_output: parsedExpected.value,
      notes: evalCase?.notes ?? null,
    };
    const saved = evalCase
      ? await updateCase.mutateAsync({ id: evalCase.id, patch: payload })
      : await createCase.mutateAsync(payload);

    if (runOnSave) {
      await runPersistedCase(saved.id);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      width={880}
      title={evalCase ? t("caseEditor.caseTitle", { name: evalCase.name }) : t("caseEditor.newCase")}
      subtitle={agentName}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            {t("caseEditor.runOnSave")}
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button kind="ghost" onClick={onClose}>
              {t("caseEditor.cancel")}
            </Button>
            <Button
              kind="secondary"
              icon="Play"
              onClick={() => evalCase && runPersistedCase(evalCase.id)}
              disabled={!evalCase || running}
            >
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button kind="primary" icon="Check" onClick={save} disabled={!parsedExpected.valid || saving}>
              {saving ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 24, padding: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} mono />
          </FormField>
          <FormField label={t("caseEditor.inputLabel")}>
            <Tabs
              tabs={[
                { key: "diff", label: t("caseEditor.tabs.diff") },
                { key: "files", label: t("caseEditor.tabs.files") },
                { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
              ]}
              value={inputTab}
              onChange={(k) => setInputTab(k as InputTab)}
              pad="0"
            />
            <div style={{ marginTop: 12 }}>
              {inputTab === "diff" && (
                <Textarea value={diffText} onChange={setDiffText} rows={14} mono placeholder={t("caseEditor.diffPlaceholder")} />
              )}
              {inputTab === "files" && <Textarea value={filesText} onChange={setFilesText} rows={14} mono />}
              {inputTab === "prMeta" && (
                <>
                  <FormField label={t("caseEditor.titleLabel")}>
                    <TextInput value={prTitle} onChange={setPrTitle} placeholder={t("caseEditor.titlePlaceholder")} />
                  </FormField>
                  <FormField label={t("caseEditor.bodyLabel")}>
                    <Textarea value={prBody} onChange={setPrBody} rows={5} placeholder={t("caseEditor.bodyPlaceholder")} />
                  </FormField>
                </>
              )}
            </div>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FormField
            label={t("caseEditor.expectedOutput")}
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {parsedExpected.valid ? (
                  <Badge color="var(--ok)" icon="Check">
                    {t("caseEditor.validJson")}
                  </Badge>
                ) : (
                  <Badge color="var(--crit)" icon="X">
                    {t("caseEditor.invalidJson")}
                  </Badge>
                )}
                <Button kind="ghost" icon="Plus" onClick={() => setExpectedText(insertFindingSkeleton(expectedText))}>
                  {t("caseEditor.findingSkeleton")}
                </Button>
              </div>
            }
          >
            <Textarea value={expectedText} onChange={setExpectedText} rows={14} mono />
          </FormField>
          {strip && (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 7,
                fontSize: 13,
                background: "var(--bg-hover)",
                color: strip.pass ? "var(--ok)" : "var(--crit)",
              }}
            >
              <strong>{strip.pass ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")}</strong>
              {" · "}
              {t("caseEditor.resultSummary", {
                expected: strip.expected,
                got: strip.got,
                duration: strip.durationMs != null ? (strip.durationMs / 1000).toFixed(1) : "—",
                cost: formatCost(strip.costUsd).replace(/^\$/, ""),
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
