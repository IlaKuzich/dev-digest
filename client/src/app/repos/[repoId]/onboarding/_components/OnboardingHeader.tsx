"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Onboarding } from "@devdigest/shared";
import { Button } from "@devdigest/ui";

interface Props {
  onboarding: Onboarding;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function OnboardingHeader({ onboarding, onRegenerate, isRegenerating }: Props) {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const [linkCopied, setLinkCopied] = React.useState(false);

  function handleShareLink() {
    // Canonical path, not verbatim window.location.href (which could carry
    // transient query/hash state specific to the current view) — but still
    // a full absolute URL (origin + path), since a copied link with no
    // domain can't actually be pasted anywhere useful (Slack, email, a new
    // tab) — it only "worked" by accident inside the same browser tab.
    const path = `/repos/${params.repoId}/onboarding`;
    const url = `${window.location.origin}${path}`;
    void navigator.clipboard?.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  }

  const ago = timeAgo(onboarding.generatedAt);

  return (
    <div style={{ padding: "18px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
            {t.rich("page.title", {
              repoName: onboarding.repoName,
              repo: (chunks) => (
                <span
                  style={{
                    color: "var(--accent-text, #60a5fa)",
                    fontFamily: "monospace",
                  }}
                >
                  {chunks}
                </span>
              ),
            })}
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              margin: 0,
            }}
          >
            {t("page.subheader", {
              filesIndexed: onboarding.filesIndexed,
              ago,
            })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={isRegenerating}
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? t("header.regenerating") : t("header.regenerate")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon={linkCopied ? "Check" : "Copy"}
            onClick={handleShareLink}
          >
            {linkCopied ? t("header.linkCopied") : t("header.shareLink")}
          </Button>
        </div>
      </div>
      {onboarding.narrativeUnavailable && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--warn)22",
            borderRadius: 6,
            color: "var(--warn)",
            fontSize: 13,
            marginTop: 16,
          }}
        >
          {t("narrativeUnavailable")}
        </div>
      )}
      <div style={{ marginTop: 16, borderBottom: "1px solid var(--border)" }} />
    </div>
  );
}

export default OnboardingHeader;
