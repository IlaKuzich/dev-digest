/* MultiAgentPicker — PR-page entry point for the multi-agent fan-out
   (spec 2026-08-25-multiagent-review, AC-1/AC-7/AC-8/AC-9/AC-10/AC-30/AC-31).
   Mounted alongside (not instead of) `RunReviewDropdown` — that dropdown
   still drives the single-agent "Run Review" flow (T3 out-of-scope: don't
   delete it). This component owns only the multi-agent fan-out trigger:
   one checkbox row per workspace agent with its time estimate, a "Run
   multi-agent review (N)" footer button, and a "Configure agents…" link
   that opens the Configure run screen with this PR preselected. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useTriggerMultiAgentRun } from "@/lib/hooks/multi-agent";
import { estimateFor, formatTimeEstimate } from "./helpers";
import { PICKER_WIDTH } from "./constants";

export function MultiAgentPicker({
  prId,
  prNumber,
  repoId,
}: {
  prId: string;
  prNumber: number;
  repoId: string;
}) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates(prId);
  const trigger = useTriggerMultiAgentRun();
  const all = agents ?? [];

  // Default to "all agents selected" (matches the mockup) the first time the
  // roster loads; the user can then deselect. Re-initializing only once per
  // mount avoids clobbering a user's deselection on every agents refetch.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (!initialized.current && all.length > 0) {
      initialized.current = true;
      setSelected(new Set(all.map((a) => a.id)));
    }
  }, [all]);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const count = selected.size;

  const runFanOut = () => {
    if (count === 0) return;
    trigger.mutate(
      { prId, repoId, prNumber, agentIds: Array.from(selected) },
      { onSuccess: () => setOpen(false) },
    );
  };

  const openConfigure = () => {
    setOpen(false);
    router.push(`/repos/${repoId}/multi-agent/configure?pr=${prNumber}`);
  };

  return (
    <div ref={panelRef} style={{ position: "relative", display: "inline-block" }}>
      <Button
        kind="secondary"
        size="sm"
        icon="Users"
        iconRight="ChevronDown"
        onClick={() => setOpen((o) => !o)}
      >
        {t("picker.trigger")}
      </Button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: PICKER_WIDTH,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            padding: 12,
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            {t("picker.title")}
          </div>

          {all.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("picker.noAgents")}</div>
          )}

          {all.map((a) => (
            <Checkbox
              key={a.id}
              checked={selected.has(a.id)}
              onChange={() => toggle(a.id)}
              label={
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flex: 1,
                    gap: 8,
                  }}
                >
                  <span>{a.name}</span>
                  <span className="mono tnum" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {formatTimeEstimate(estimateFor(estimates, a.id), t("picker.noHistory"))}
                  </span>
                </span>
              }
            />
          ))}

          <Button
            kind="primary"
            size="sm"
            full
            icon="Users"
            disabled={count === 0}
            loading={trigger.isPending}
            onClick={runFanOut}
          >
            {t("picker.runReviewCount", { count })}
          </Button>

          <button
            type="button"
            onClick={openConfigure}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 12.5,
              textAlign: "left",
              cursor: "pointer",
              padding: "2px 0",
            }}
          >
            {t("picker.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
