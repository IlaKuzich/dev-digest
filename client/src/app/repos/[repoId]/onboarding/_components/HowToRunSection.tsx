"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { HowToRunSection as HowToRunSectionType } from "@devdigest/shared";

interface Props {
  section: HowToRunSectionType;
}

/** Copy-to-clipboard button — mirrors PromptBlock's pattern: icon flips
    Copy -> Check for 1200ms after a click. */
function CopyButton({
  text,
  copyLabel,
  copiedLabel,
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? copiedLabel : copyLabel}
      aria-label={copied ? copiedLabel : copyLabel}
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: 5,
        display: "inline-flex",
        color: "var(--text-muted)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
    </button>
  );
}

export function HowToRunSection({ section }: Props) {
  const t = useTranslations("onboarding.howToRun");
  const copyLabel = t("copyCommand");
  const copiedLabel = t("copied");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        <span>{t("packageManagerLabel")}</span>
        <code
          style={{
            background: "var(--bg-elevated)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {section.packageManager}
        </code>
      </div>

      <div style={{ marginBottom: 20 }}>
        {section.commands.map((cmd, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 6,
              background: "var(--bg-elevated)",
              padding: "8px 12px",
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            <span style={{ flex: 1, color: "var(--text-primary)" }}>{cmd}</span>
            <CopyButton text={cmd} copyLabel={copyLabel} copiedLabel={copiedLabel} />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("envVarsLabel")}
        </div>
        {section.envVars.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {section.envVars.map((v) => (
              <code
                key={v}
                style={{
                  fontSize: 12,
                  background: "var(--bg-elevated)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  color: "var(--text-secondary)",
                }}
              >
                {v}
              </code>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
            {t("noEnvVars")}
          </div>
        )}
      </div>

      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("entrypointLabel")}
        </div>
        <div
          style={{
            background: "var(--bg-elevated)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{section.entrypoint}</span>
          <CopyButton text={section.entrypoint} copyLabel={copyLabel} copiedLabel={copiedLabel} />
        </div>
      </div>
    </div>
  );
}

export default HowToRunSection;
