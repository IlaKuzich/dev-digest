"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { s } from "./styles";

/** Renders the DRAFT body — what the reviewing agent would receive if saved now. */
export function PreviewTab({ body }: { body: string }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("editor.preview")}</h2>
        <p style={s.subtitle}>{t("editor.previewHint")}</p>
      </div>
      {body.trim() ? (
        <div style={s.card}>
          <Markdown>{body}</Markdown>
        </div>
      ) : (
        <div style={s.empty}>{t("editor.previewEmpty")}</div>
      )}
    </div>
  );
}
