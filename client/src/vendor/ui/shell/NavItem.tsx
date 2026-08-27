import React from "react";
import { Icon } from "../icons";
import { resolveHref, type NavItemDef } from "../nav";
import { DefaultLink } from "./DefaultLink";
import type { LinkLike } from "./types";

export function NavItem({
  item,
  active,
  repoId,
  Link = DefaultLink,
}: {
  item: NavItemDef;
  active?: boolean;
  repoId?: string | null;
  Link?: LinkLike;
}) {
  const I = Icon[item.icon];
  const [h, setH] = React.useState(false);

  const inner = (
    <div
      onMouseEnter={() => !item.disabled && setH(true)}
      onMouseLeave={() => setH(false)}
      aria-disabled={item.disabled ? "true" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 6,
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        cursor: item.disabled ? "default" : "pointer",
        position: "relative",
        color: item.disabled
          ? "var(--text-muted)"
          : active
            ? "var(--text-primary)"
            : h
              ? "var(--text-primary)"
              : "var(--text-secondary)",
        background: item.disabled ? "transparent" : active ? "var(--bg-hover)" : h ? "var(--bg-elevated)" : "transparent",
        opacity: item.disabled ? 0.55 : 1,
        transition: "background .12s, color .12s",
      }}
    >
      {active && !item.disabled && (
        <span
          style={{
            position: "absolute",
            left: -8,
            top: 7,
            bottom: 7,
            width: 2.5,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
      )}
      <I size={16} style={{ color: active && !item.disabled ? "var(--accent)" : "inherit" }} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span
          className="tnum"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 99,
            padding: "0 8px",
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {item.badge}
        </span>
      )}
    </div>
  );

  // A disabled placeholder item is inert text — no `Link`/`href`, so it can
  // never navigate (e.g. the unbuilt Memory / Multi-Agent Review / Agent
  // Performance sections).
  if (item.disabled) return inner;

  return <Link href={resolveHref(item.href, repoId)}>{inner}</Link>;
}
