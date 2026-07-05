/* ArchitectureSection — inline simplified diagram (level 1) + 3-level
   drill-down: clicking a top node opens a modal with a detailed MermaidDiagram
   for that node (level 2); clicking the overflow node opens a modal with a
   scrollable list, each item expanding its own detail view (level 3).

   MermaidDiagram only accepts a `chart` string and offers no per-node click
   hook, and it is a shared component outside this task's owned paths (used
   as-is, per the plan). So drill-down targets are rendered as a row of node
   "chips" alongside the inline diagram rather than clicks inside the injected
   SVG — functionally equivalent (each real node is a click target that opens
   the same detail data), without depending on parsing mermaid's internal SVG
   structure. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type {
  ArchitectureSection as ArchitectureSectionType,
  DiagramNode,
} from "@devdigest/shared";
import { MermaidDiagram, looksLikeMermaid } from "@/components/mermaid-diagram/MermaidDiagram";
import { DrillDownModal } from "./DrillDownModal";

interface Props {
  section: ArchitectureSectionType;
}

/** Color-code nodes by `kind` (file=blue, package=orange, service=green),
    matching this feature's established file/package/service color
    convention — an overflow node always wins the plain "overflow" style
    regardless of its `kind`. */
function nodeClass(node: DiagramNode): string {
  if (node.isOverflow) return "overflow";
  switch (node.kind) {
    case "file":
      return "kindFile";
    case "service":
      return "kindService";
    case "package":
      return "kindPackage";
    default:
      return "";
  }
}

/**
 * `node.id` is LLM-assigned free text (often a real package/file name like
 * "@devdigest/web" or "server/src/db/schema.ts") — using it directly as a
 * bare Mermaid node identifier is invalid syntax whenever it contains `@`,
 * `/`, `.`, or similar (Mermaid IDs must be simple tokens). An earlier
 * generation happened to use plain-word ids ("client", "server") and looked
 * fine; this generation used real package names as ids and the WHOLE
 * diagram silently failed to parse — MermaidDiagram renders nothing at all
 * on invalid input (not even an error box), so the diagram appeared to
 * "disappear." Always map every node id to a synthetic safe token (`n0`,
 * `n1`, ...) for the actual Mermaid syntax; the real id/label only ever
 * appears inside quoted label text, which Mermaid handles fine.
 */
function buildMermaid(section: ArchitectureSectionType): string {
  const safeId = new Map(section.nodes.map((n, i) => [n.id, `n${i}`]));
  const lines = ["flowchart LR"];
  for (const node of section.nodes) {
    const cls = nodeClass(node);
    lines.push(`  ${safeId.get(node.id)}["${node.label}"]${cls ? `:::${cls}` : ""}`);
  }
  for (const edge of section.edges) {
    const from = safeId.get(edge.from);
    const to = safeId.get(edge.to);
    if (!from || !to) continue; // dangling edge to an unknown/stripped node
    const label = edge.label ? `|"${edge.label}"|` : "";
    lines.push(`  ${from} -->${label} ${to}`);
  }
  lines.push("  classDef overflow fill:#334,stroke:#667,color:#aab");
  lines.push("  classDef kindFile fill:#0f1b2d,stroke:#60a5fa,color:#e2e8f0");
  lines.push("  classDef kindPackage fill:#2a1f0d,stroke:#fbbf24,color:#e2e8f0");
  lines.push("  classDef kindService fill:#0d2418,stroke:#4ade80,color:#e2e8f0");
  return lines.join("\n");
}

/** Overflow node's `detail` (same generic "mermaid for drill-down" field as any
    other node) is read as a newline-delimited list of collapsed item labels
    for the level-3 scrollable list. Falls back to the node's own label when
    no further detail was provided. */
function overflowItems(node: DiagramNode): string[] {
  const raw = (node.detail ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length > 0 ? raw : [node.label];
}

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const overflowChipStyle: React.CSSProperties = {
  ...chipStyle,
  borderStyle: "dashed",
  color: "var(--text-muted)",
};

export function ArchitectureSectionView({ section }: Props) {
  const t = useTranslations("onboarding.architecture");
  const chart = buildMermaid(section);
  const [activeNode, setActiveNode] = React.useState<DiagramNode | null>(null);
  const [expandedItem, setExpandedItem] = React.useState<number | null>(null);

  const topNodes = section.nodes.filter((n) => !n.isOverflow);
  const overflowNode = section.nodes.find((n) => n.isOverflow) ?? null;

  function openNode(node: DiagramNode) {
    setExpandedItem(null);
    setActiveNode(node);
  }

  function closeModal() {
    setActiveNode(null);
    setExpandedItem(null);
  }

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
        {section.overview}
      </p>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 12,
          fontStyle: "italic",
        }}
      >
        {section.style}
      </div>
      <MermaidDiagram chart={chart} />
      {section.nodes.length > 1 && section.edges.length === 0 && (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            marginTop: 8,
            fontStyle: "italic",
          }}
        >
          {t("noRelationships")}
        </p>
      )}

      {(topNodes.length > 0 || overflowNode) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {topNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => openNode(node)}
              style={chipStyle}
            >
              {node.label}
            </button>
          ))}
          {overflowNode && (
            <button
              type="button"
              onClick={() => openNode(overflowNode)}
              style={overflowChipStyle}
            >
              {overflowNode.label}
            </button>
          )}
        </div>
      )}

      {activeNode && !activeNode.isOverflow && (
        <DrillDownModal title={activeNode.label} onClose={closeModal}>
          {activeNode.detail && looksLikeMermaid(activeNode.detail) ? (
            <MermaidDiagram chart={activeNode.detail} />
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("noDetail")}</p>
          )}
        </DrillDownModal>
      )}

      {activeNode && activeNode.isOverflow && (
        <DrillDownModal title={activeNode.label} onClose={closeModal}>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              maxHeight: "50vh",
              overflowY: "auto",
            }}
          >
            {overflowItems(activeNode).map((label, i) => (
              <li key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setExpandedItem((cur) => (cur === i ? null : i))}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px 4px",
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                >
                  {label}
                </button>
                {expandedItem === i && (
                  <div
                    style={{
                      padding: "0 4px 10px",
                      color: "var(--text-secondary)",
                      fontSize: 12,
                    }}
                  >
                    {t("overflowItemDetail", { label })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </DrillDownModal>
      )}
    </div>
  );
}

export default ArchitectureSectionView;
