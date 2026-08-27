"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";
import type { InstallMode } from "./types";

/** Install step (AC-16, mockup `wizard-step4-install.png`). Purely
 *  presentational — mutation state (pending/success/error) is owned by
 *  `ExportWizard.tsx` and passed in, so the "Install" trigger can live in the
 *  shared modal footer alongside Back/Continue. */
export function InstallStep({
  repo,
  fileCount,
  installMode,
  onInstallMode,
  prUrl,
  installError,
  zipDownloaded,
  zipError,
}: {
  repo: string;
  fileCount: number;
  installMode: InstallMode;
  onInstallMode: (mode: InstallMode) => void;
  prUrl: string | null | undefined;
  installError: string | null;
  zipDownloaded: boolean;
  zipError: string | null;
}) {
  const t = useTranslations("ci");

  return (
    <div>
      <div role="radiogroup" aria-label={t("exportWizard.installCardTitle")}>
        <button
          type="button"
          role="radio"
          aria-checked={installMode === "open_pr"}
          style={{ ...s.installCard, ...(installMode === "open_pr" ? s.installCardActive : {}) }}
          onClick={() => onInstallMode("open_pr")}
        >
          <div style={s.installCardHeader}>
            <Icon.GitPullRequest size={16} style={{ color: "var(--accent)" }} />
            <span style={s.installCardTitle}>{t("exportWizard.installCardTitle")}</span>
          </div>
          <div style={s.installCardBody}>
            {t("exportWizard.installCardBody", { repo: repo || t("exportWizard.ownerRepo"), count: fileCount })}
          </div>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={installMode === "files"}
          style={{ ...s.installCard, ...(installMode === "files" ? s.installCardActive : {}) }}
          onClick={() => onInstallMode("files")}
        >
          <div style={s.installCardHeader}>
            <Icon.Copy size={16} style={{ color: "var(--text-muted)" }} />
            <span style={s.installCardTitle}>Copy files as a zip</span>
          </div>
          <div style={s.installCardBody}>Downloads a zip you add to the repo manually.</div>
        </button>
      </div>

      <div style={s.helpLink}>
        Need help? See the{" "}
        <a href="https://docs.github.com/en/actions" target="_blank" rel="noreferrer">
          GitHub Actions setup docs
        </a>
      </div>

      {prUrl && (
        <div style={s.successBanner} role="status">
          Pull request opened —{" "}
          <a href={prUrl} target="_blank" rel="noreferrer">
            View pull request
          </a>
        </div>
      )}
      {installError && (
        <div style={s.errorBanner} role="alert">
          {installError}
        </div>
      )}
      {zipDownloaded && (
        <div style={s.successBanner} role="status">
          Downloaded devdigest-ci.zip.
        </div>
      )}
      {zipError && (
        <div style={s.errorBanner} role="alert">
          {zipError}
        </div>
      )}
    </div>
  );
}
