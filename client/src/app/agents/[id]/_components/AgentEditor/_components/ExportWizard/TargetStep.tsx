"use client";

import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, TextInput, type IconName } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { s } from "./styles";

interface TargetDef {
  key: CiTarget;
  icon: IconName;
  disabled?: boolean;
}

/** Only "gha" is real in v1 (spec Non-goals) — the other three render
 *  `aria-disabled` "Coming soon" cards (AC-9). */
const TARGETS: TargetDef[] = [
  { key: "gha", icon: "Workflow" },
  { key: "circle", icon: "RefreshCw", disabled: true },
  { key: "jenkins", icon: "Settings", disabled: true },
  { key: "cli", icon: "Command", disabled: true },
];

export function TargetStep({
  target,
  onTarget,
  repo,
  onRepo,
}: {
  target: CiTarget;
  onTarget: (t: CiTarget) => void;
  repo: string;
  onRepo: (r: string) => void;
}) {
  const t = useTranslations("ci");

  return (
    <div>
      <div style={s.targetGrid}>
        {TARGETS.map((def) => {
          const I = Icon[def.icon];
          const selected = target === def.key;
          return (
            <button
              key={def.key}
              type="button"
              aria-disabled={def.disabled ? true : undefined}
              style={{
                ...s.targetCard,
                ...(selected ? s.targetCardSelected : {}),
                ...(def.disabled ? s.targetCardDisabled : {}),
              }}
              onClick={() => {
                if (def.disabled) return;
                onTarget(def.key);
              }}
            >
              <div style={s.targetCardHead}>
                <I size={18} style={{ color: "var(--text-muted)" }} />
                <span style={s.targetCardTitle}>{t(`exportWizard.targets.${def.key}`)}</span>
                {def.key === "gha" && <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.recommended")}</Badge>}
                {def.disabled && <Badge>Coming soon</Badge>}
              </div>
              <div style={s.targetCardDesc}>{t(`exportWizard.targets.${def.key}Desc`)}</div>
            </button>
          );
        })}
      </div>

      <FormField label={t("exportWizard.repoLabel")} hint={t("exportWizard.repoHint")} required>
        <TextInput value={repo} onChange={onRepo} placeholder={t("exportWizard.repoPlaceholder")} mono />
      </FormField>
    </div>
  );
}
