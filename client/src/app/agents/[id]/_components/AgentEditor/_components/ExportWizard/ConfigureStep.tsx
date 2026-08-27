"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import { useSecretsStatus } from "@/lib/hooks/core";
import { postAsHint, POST_AS_I18N_KEY } from "./helpers";
import { radioDot, s } from "./styles";
import type { PostAs } from "./types";

const TRIGGER_KEYS = ["opened", "synchronize", "reopened"] as const;
const POST_AS_VALUES: PostAs[] = ["github_review", "pr_comment", "none"];

/** Configure step (AC-15/47, mockup `wizard-step3-configure.png`). Secret
 *  STATUS only — never a value (AC-15/40): OPENROUTER_API_KEY reflects the
 *  real `useSecretsStatus()` result, GITHUB_TOKEN is always "ready" (a
 *  GitHub Actions built-in, not one of this app's stored secrets). */
export function ConfigureStep({
  triggers,
  onTriggers,
  postAs,
  onPostAs,
}: {
  triggers: string[];
  onTriggers: (triggers: string[]) => void;
  postAs: PostAs;
  onPostAs: (postAs: PostAs) => void;
}) {
  const t = useTranslations("ci");
  const { data: secrets } = useSecretsStatus();
  const openrouterReady = secrets?.openrouter ?? false;

  const toggleTrigger = (key: string) => {
    onTriggers(triggers.includes(key) ? triggers.filter((k) => k !== key) : [...triggers, key]);
  };

  return (
    <div>
      <div style={s.sectionLabel}>{t("exportWizard.triggerLabel")}</div>
      <div style={s.triggerRow}>
        {TRIGGER_KEYS.map((key) => {
          const active = triggers.includes(key);
          return (
            <Chip key={key} active={active} icon={active ? "Check" : undefined} onClick={() => toggleTrigger(key)}>
              <span className="mono">pull_request:{key}</span>
            </Chip>
          );
        })}
      </div>

      <div style={s.sectionLabel}>Secrets expected</div>
      <div style={s.secretsList}>
        <div style={s.secretRow}>
          <span className="mono">OPENROUTER_API_KEY</span>
          <span style={{ color: openrouterReady ? "var(--ok)" : "var(--warn)" }}>
            {openrouterReady ? "ready" : "not set"}
          </span>
        </div>
        <div style={s.secretRow}>
          <span className="mono">GITHUB_TOKEN</span>
          <span style={{ color: "var(--ok)" }}>ready</span>
        </div>
      </div>
      <div style={s.secretNote}>{t("exportWizard.secretNote", { key: "OPENROUTER_API_KEY" })}</div>

      <div style={s.sectionLabel}>{t("exportWizard.postResultsLabel")}</div>
      <div style={s.postAsGroup} role="radiogroup" aria-label={t("exportWizard.postResultsLabel")}>
        {POST_AS_VALUES.map((value) => {
          const active = postAs === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              style={{ ...s.postAsOption, ...(active ? s.postAsOptionActive : {}) }}
              onClick={() => onPostAs(value)}
            >
              <span style={radioDot(active)} />
              {t(`exportWizard.postAs.${POST_AS_I18N_KEY[value]}`)}
              {value === "github_review" && (
                <span style={{ marginLeft: 6 }}>{t("exportWizard.recommended")}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={s.postAsHint}>{postAsHint(postAs)}</div>

      <div style={s.blockMergeCallout}>
        <div style={s.blockMergeTitle}>{t("exportWizard.blockMergeTitle")}</div>
        <div>{t("exportWizard.blockMergeDesc")}</div>
      </div>
    </div>
  );
}
