/* ViewToggle — the Tree / Graph segmented control in the BlastCard header.
   Built locally: @devdigest/ui ships no segmented/toggle-group primitive.
   Labels come from the pre-seeded blast.json `view.*` keys. */
"use client";

import { useTranslations } from "next-intl";
import { s, toggleSegmentFor } from "./styles";

export type BlastView = "tree" | "graph";

export function ViewToggle({
  view,
  onChange,
}: {
  view: BlastView;
  onChange: (next: BlastView) => void;
}) {
  const t = useTranslations("blast");

  return (
    <div style={s.toggleRail} role="tablist" aria-label="Blast radius view">
      <button
        type="button"
        role="tab"
        aria-selected={view === "tree"}
        onClick={() => onChange("tree")}
        style={toggleSegmentFor(view === "tree")}
      >
        {t("view.tree")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "graph"}
        onClick={() => onChange("graph")}
        style={toggleSegmentFor(view === "graph")}
      >
        {t("view.graph")}
      </button>
    </div>
  );
}
