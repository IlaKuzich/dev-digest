"use client";

import React from "react";
import { Icon } from "@devdigest/ui";

interface AccordionSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AccordionSection({
  id,
  title,
  icon,
  defaultOpen = true,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Expose scroll-to + expand via a custom event (for ScrollSpyNav)
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handler = () => {
      setOpen(true);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    el.addEventListener("onboarding:scrollTo", handler);
    return () => el.removeEventListener("onboarding:scrollTo", handler);
  }, []);

  return (
    <div
      ref={rootRef}
      id={id}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          cursor: "pointer",
          background: "var(--bg-elevated)",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{title}</span>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
            display: "inline-flex",
          }}
        >
          <Icon.ChevronDown size={16} />
        </span>
      </div>
      {open && (
        <div style={{ padding: "18px 20px", background: "var(--bg)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
