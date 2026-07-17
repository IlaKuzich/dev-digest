import type { ContextDoc } from "@devdigest/shared";

/** Which entity this tab is attaching documents to — drives which pair of
    context hooks (`useAgentContext`/`useSkillContext`) is live. */
export interface ContextAttachOwner {
  kind: "agent" | "skill";
  id: string;
}

/** One row of the attach list: a discovered document plus this owner's
    attached flag for it. Order in the surrounding array IS the display/save
    order — mirrors `SkillRowState` in the AgentEditor Skills tab. */
export interface ContextRowState {
  doc: ContextDoc;
  attached: boolean;
}
