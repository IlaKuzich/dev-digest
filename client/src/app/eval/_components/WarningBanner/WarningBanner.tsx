/* WarningBanner — amber degradation banner (AC-25). The alert message is
   entirely server-computed (`AgentEvalDashboard.alert`); this component only
   renders it — no client-side threshold logic here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function WarningBanner({ message }: { message: string | null }) {
  const t = useTranslations("eval");
  if (!message) return null;
  return (
    <div role="alert" aria-label={t("banner.ariaLabel")} style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <span style={s.text}>{message}</span>
    </div>
  );
}
