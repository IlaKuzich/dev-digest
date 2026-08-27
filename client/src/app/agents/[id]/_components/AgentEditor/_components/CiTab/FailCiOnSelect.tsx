"use client";

import { SelectInput } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { s } from "./styles";

/** AC-19 — CI tab's own "Fail CI on" control: a reduced 3-option view
 *  (Critical | Warning+ | Never) over the same `ci_fail_on` field the Config
 *  tab's 4-option "CI gate" select also writes (that select additionally
 *  offers "any"). Both write the same column via the existing agents-update
 *  path; this control does NOT push the change to CI by itself — the new
 *  policy only reaches already-installed repos on the next explicit
 *  "Update CI config" (per AC-19). Labels are literal strings, not i18n keys,
 *  because `ci.json`/`agents.json` are out of this task's file ownership and
 *  the AC's exact wording ("Critical" / "Warning+" / "Never") doesn't match
 *  the Config tab's existing `ciFailOnOptions` copy ("Block on critical…") —
 *  same "literal string over an out-of-scope i18n edit" pattern as client
 *  INSIGHTS.md 2026-07-17 (SkillEditor "Context" tab label). */
const TAB_OPTIONS: { value: CiFailOn; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning+" },
  { value: "never", label: "Never" },
];

export function FailCiOnSelect({ agent }: { agent: Agent }) {
  const update = useUpdateAgent();
  const known = TAB_OPTIONS.some((o) => o.value === agent.ci_fail_on);
  // `ci_fail_on` also allows "any" (Config tab only) — outside this control's
  // 3-option range; fall back to "critical" (the platform default) rather
  // than feeding the native <select> a value with no matching <option>.
  const value = known ? agent.ci_fail_on : "critical";

  return (
    <div style={s.failOnRow}>
      <span style={s.failOnLabel}>Fail CI on</span>
      <div style={s.failOnControl}>
        <SelectInput
          value={value}
          onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
          options={TAB_OPTIONS}
        />
      </div>
    </div>
  );
}
