/* DrillDownModal — generic portal/overlay/ESC modal shell for the Architecture
   diagram's drill-down levels (node detail, overflow list). Mirrors
   BlastGraphLightbox.tsx's shell (createPortal, overlay-click-to-close,
   stopPropagation on the panel, ESC-key listener) WITHOUT its
   ResizeObserver/D3 dimension logic — this modal's content sizes itself. */
"use client";

import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface DrillDownModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function DrillDownModal({ title, onClose, children }: DrillDownModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-[95vw] h-[90vh] max-w-none rounded-xl overflow-auto flex flex-col p-6"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default DrillDownModal;
