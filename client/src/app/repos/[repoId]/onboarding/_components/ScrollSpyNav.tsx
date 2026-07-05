"use client";

import React from "react";

interface ScrollSpyNavProps {
  sections: Array<{ id: string; label: string }>;
  title: string;
}

export function ScrollSpyNav({ sections, title }: ScrollSpyNavProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );

    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    // Dispatch custom event to expand accordion if collapsed
    el.dispatchEvent(
      new CustomEvent("onboarding:scrollTo", { bubbles: false }),
    );
  }

  return (
    <nav
      style={{
        position: "sticky",
        top: 80,
        width: 200,
        flexShrink: 0,
        alignSelf: "flex-start",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {sections.map(({ id, label }) => (
          <li key={id} style={{ marginBottom: 6 }}>
            <button
              onClick={() => scrollTo(id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 5,
                fontSize: 13,
                color: activeId === id ? "var(--accent)" : "var(--text-muted)",
                fontWeight: activeId === id ? 600 : 400,
                width: "100%",
                textAlign: "left",
                borderLeft: `2px solid ${activeId === id ? "var(--accent)" : "transparent"}`,
                transition: "all 0.15s ease",
              }}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
