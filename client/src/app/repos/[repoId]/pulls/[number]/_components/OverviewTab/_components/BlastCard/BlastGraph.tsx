/* BlastGraph — the "Graph" half of the BlastCard's view toggle: the same
   blast map the tree shows, drawn as a directed impact graph
   (changed symbol → its callers → the endpoints they serve).

   Edges point in IMPACT order (symbol → caller), not dependency order — the
   question this card answers is "if I change this, what breaks downstream",
   so the arrow follows the breakage.

   Renders through the existing components/mermaid-diagram primitive rather
   than adding a graph dependency; mermaid is already a client dep and that
   component already validates with mermaid.parse() before rendering. */
"use client";

import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram/MermaidDiagram";
import { s } from "./styles";

/** Mermaid node labels are quoted, so a `"` in untrusted index data (symbol
    names, file paths, endpoint strings) would break out of the label and
    corrupt the diagram. Plain string ops only — no dynamically-built RegExp
    (root INSIGHTS.md:29). Node IDs are positional (`n0`, `n1`, …) precisely so
    that no untrusted text ever reaches an identifier position. */
function label(text: string): string {
  return text.split('"').join("&quot;").split("\n").join(" ");
}

export function buildBlastChart(downstream: DownstreamImpact[]): string {
  const lines: string[] = ["flowchart LR"];
  let seq = 0;
  const idFor = new Map<string, string>();
  const nodeId = (key: string, text: string, shape: "round" | "box"): string => {
    const existing = idFor.get(key);
    if (existing) return existing;
    const id = `n${seq++}`;
    idFor.set(key, id);
    lines.push(shape === "round" ? `  ${id}(["${label(text)}"])` : `  ${id}["${label(text)}"]`);
    return id;
  };

  for (const impact of downstream) {
    const symId = nodeId(`sym:${impact.symbol}`, impact.symbol, "round");
    for (const caller of impact.callers) {
      const callerKey = `call:${caller.file}:${caller.line}`;
      const callerId = nodeId(callerKey, `${caller.name}\n${caller.file}:${caller.line}`, "box");
      lines.push(`  ${symId} --> ${callerId}`);
      for (const ep of impact.endpoints_affected) {
        lines.push(`  ${callerId} --> ${nodeId(`ep:${ep}`, ep, "round")}`);
      }
    }
  }
  return lines.join("\n");
}

export function BlastGraph({ downstream }: { downstream: DownstreamImpact[] }) {
  const t = useTranslations("blast");

  if (downstream.length === 0) {
    return <p style={s.graphEmpty}>{t("graph.empty")}</p>;
  }

  return (
    <div aria-label={t("graph.ariaLabel")}>
      <MermaidDiagram chart={buildBlastChart(downstream)} />
    </div>
  );
}
