"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent, CiTarget } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useExportCiInstall, useExportCiPreview, useExportCiZip } from "@/lib/hooks/ci";
import { parseYamlSafe, lintWorkflowYml } from "@/components/yaml-editor";
import { TargetStep } from "./TargetStep";
import { PreviewStep } from "./PreviewStep";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { buildExportInput, editableFile, mutationErrorMessage, previewableFiles } from "./helpers";
import type { InstallMode, PostAs } from "./types";
import { s } from "./styles";

const DEFAULT_TRIGGERS = ["opened", "synchronize"];
const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

/** Export Wizard shell (AC-8) — opened from "Add to CI"/"+ Add repository".
 *  ALL step state lives here in React state (Variant A, no Save button, no
 *  draft persistence): it's preserved across Back/Continue simply because
 *  this component instance doesn't unmount between steps, and discarded on
 *  close simply because closing unmounts it (AC-14). */
export function ExportWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci");
  const { activeRepo } = useActiveRepo();

  const [step, setStep] = React.useState(0);
  const [target, setTarget] = React.useState<CiTarget>("gha");
  const [repo, setRepo] = React.useState(activeRepo?.full_name ?? "");
  const [triggers, setTriggers] = React.useState<string[]>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [workflowYml, setWorkflowYml] = React.useState<string | undefined>(undefined);
  const [installMode, setInstallMode] = React.useState<InstallMode>("open_pr");

  const preview = useExportCiPreview();
  const install = useExportCiInstall();
  const zip = useExportCiZip();

  // Fetch the live bundle every time Preview is (re)entered (AC-10/46) — keyed
  // only on `step` so it fires on the Target→Preview transition, not on every
  // keystroke while editing the repo/target on step 0.
  React.useEffect(() => {
    if (step !== 1) return;
    preview.mutate({
      agentId: agent.id,
      input: { repo, target, triggers, post_as: postAs, base: "main" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const files = preview.data?.files ?? [];
  const visibleFiles = previewableFiles(files);
  const workflowFile = editableFile(files);
  const workflowText = workflowYml ?? workflowFile?.contents ?? "";
  const parseResult = workflowFile ? parseYamlSafe(workflowText) : { ok: true as const };
  const lintWarnings = workflowFile ? lintWorkflowYml(workflowText) : [];

  const exportInput = buildExportInput({ target, repo, triggers, postAs, workflowYml });

  const labels = STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`));

  const canContinue =
    step === 0
      ? target === "gha" && repo.trim().length > 0
      : step === 1
        ? !preview.isPending && !preview.isError && parseResult.ok
        : true;

  const onInstall = () => {
    if (installMode === "open_pr") {
      install.mutate({ agentId: agent.id, input: exportInput });
    } else {
      zip.mutate({ agentId: agent.id, input: exportInput });
    }
  };

  const installPending = install.isPending || zip.isPending;

  return (
    <Modal
      width={860}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {step > 0 && (
            <Button kind="ghost" icon="ChevronLeft" onClick={() => setStep((v) => v - 1)}>
              {t("exportWizard.back")}
            </Button>
          )}
          <div style={{ marginLeft: "auto" }}>
            {step < 3 ? (
              <Button
                kind="primary"
                iconRight="ArrowRight"
                disabled={!canContinue}
                onClick={() => setStep((v) => v + 1)}
              >
                {t("exportWizard.continue")}
              </Button>
            ) : (
              <Button kind="primary" icon="Check" disabled={installPending} onClick={onInstall}>
                {installPending ? t("exportWizard.installing") : t("exportWizard.install")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={s.stepper}>
        <ExportWizardSteps step={step} labels={labels} />
      </div>
      <div style={s.body}>
        {step === 0 && <TargetStep target={target} onTarget={setTarget} repo={repo} onRepo={setRepo} />}
        {step === 1 && (
          <PreviewStep
            files={visibleFiles}
            isLoading={preview.isPending}
            isError={preview.isError}
            workflowPath={workflowFile?.path}
            workflowText={workflowText}
            onWorkflowChange={setWorkflowYml}
            parseError={!parseResult.ok ? parseResult.message : null}
            lintWarnings={lintWarnings}
          />
        )}
        {step === 2 && (
          <ConfigureStep triggers={triggers} onTriggers={setTriggers} postAs={postAs} onPostAs={setPostAs} />
        )}
        {step === 3 && (
          <InstallStep
            repo={repo}
            fileCount={files.length}
            installMode={installMode}
            onInstallMode={setInstallMode}
            prUrl={install.isSuccess ? install.data?.pr_url : null}
            installError={install.isError ? mutationErrorMessage(install.error) : null}
            zipDownloaded={zip.isSuccess}
            zipError={zip.isError ? mutationErrorMessage(zip.error) : null}
          />
        )}
      </div>
    </Modal>
  );
}
