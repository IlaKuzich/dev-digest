import React from "react";

// ---- Formatting helpers (exported so TraceBody can use formatCost directly) ----

export function formatCost(usd: number | null | undefined): string {
  if (usd == null || usd === 0) return "—";
  if (usd < 0.0001) return "<$0.0001";
  // Format to 4 dp, strip trailing zeros but keep minimum 2 decimal places.
  const stripped = usd.toFixed(4).replace(/(\.\d{2}.*?)0+$/, '$1');
  return "$" + stripped;
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

// ---- Component ----

interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** compact: "$0.012" (PR list column, default)
   *  inline:  "9.1K tok · $0.0013" (run history row) */
  variant?: "compact" | "inline";
}

const compactStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 13,
  color: "var(--text-secondary)",
};

const inlineStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: RunCostBadgeProps) {
  if (variant === "inline") {
    const cost = formatCost(costUsd);
    if (cost === "—") return <span style={inlineStyle}>—</span>;
    const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0);
    const tokStr = totalTokens > 0 ? `${formatTokenCount(totalTokens)} tok · ` : "";
    return (
      <span style={inlineStyle}>
        {tokStr}{cost}
      </span>
    );
  }

  return <span style={compactStyle}>{formatCost(costUsd)}</span>;
}
