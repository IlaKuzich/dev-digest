# Skills — Core Loop (Slice A + B)

**Date:** 2026-07-04
**Branch:** `2-SKILLS`
**Status:** Approved design → ready for implementation plan

## Summary

Make **skills** a first-class, usable feature end-to-end: authored in the UI (DB is
the source of truth), bound to an agent with per-agent enable/disable and ordering,
and — critically — **actually injected into the review prompt** so a skill changes a
real review and is visible in the run trace.

Most of the backend plumbing already shipped in the Part-0 starter. This spec fills
the gaps that make skills *do something*.

### Already exists (Part-0 starter — do not rebuild)
- **DB**: `skills` + `skill_versions` tables; `agent_skills` link table (order only);
  `agents` + `agent_versions`.
- **Contracts** (`@devdigest/shared`): `Skill`, `SkillType`, `SkillSource`,
  `AgentSkillLink`, `Agent`.
- **Server `agents` module**: full CRUD + `GET/POST /agents/:id/skills` (link/reorder).
- **reviewer-core**: `assemblePrompt` renders a `## Skills / rules` block from linked
  skill bodies, ordered; `reviewPullRequest` already accepts a `skills: string[]` param.
- **Client**: Agents list + Agent editor (ConfigTab only).
- **Trace**: `run-executor.ts` persists `outcome.assembly` into `trace.prompt_assembly`.

### The crux
`run-executor.ts` calls `reviewPullRequest({...})` **without `skills`**. Linking a
skill to an agent currently changes nothing in the actual review. Wiring this is the
core value of the lesson and makes the (follow-up) control experiment possible.

## Scope

**In scope (this spec):**
- Slice A — Skills CRUD (server module) + Skills page + Skill editor.
- Slice B — Agent "Skills" tab (bind / enable / reorder) + wire enabled skills into
  the review run + trace block.

**Out of scope (follow-up specs):**
- Import (markdown / archive extraction, preview, executable parts not run).
- Test Quality Reviewer agent + control experiment fixtures.
- Evals / Stats / CI tabs.

## Design

### 1. Schema (one additive migration)

- **`agent_skills`**: add `enabled boolean NOT NULL DEFAULT true`.
  - This is the one edit to an existing schema file (`server/src/db/schema/agents.ts`)
    plus a generated `ALTER TABLE` migration. Additive only; approved deviation from
    the "extend with a new file" convention (Drizzle requires editing the table def).
  - **Model**: an agent keeps an ordered `agent_skills` row for every workspace skill
    it has touched, each with `enabled` + `order`. Unchecking a skill keeps its row
    (preserves position); it is simply excluded from the prompt. Matches the
    screenshot's single all-rows-draggable list with independent checkboxes.
- **`skills` / `skill_versions`**: already complete — no change.

### 2. Contracts (`@devdigest/shared`)

Canonical copy lives in `server/src/vendor/shared/`; mirror the edit into the client's
vendored copy (`client/src/vendor/shared/`). reviewer-core does not need these.

- `AgentSkillLink`: add `enabled: boolean`.
- `CreateSkillInput` / `UpdateSkillInput`: `name`, `description`, `type` (`SkillType`),
  `body`; `source` is server-defaulted to `manual` on create. `enabled` optional on
  update (global toggle).

### 3. Server — new `skills` module

Onion architecture: `routes → service → repository`. Register in `modules/index.ts`.

Routes (Zod bodies on every route; no hand-rolled parse):
- `GET  /skills`         → list (workspace-scoped)
- `GET  /skills/:id`     → one
- `POST /skills`         → create (`source: 'manual'`, `version: 1`)
- `PUT  /skills/:id`     → update (body/metadata and/or `enabled` toggle)
- `DELETE /skills/:id`   → delete (cascade removes `agent_skills` rows + `skill_versions`)

Repository owns `skills` + `skill_versions`:
- Editing the **body bumps `version` and snapshots the prior body** into
  `skill_versions` (parity with agent versioning). Metadata-only or `enabled`-only
  changes do **not** bump version.
- `toSkillDto` maps row → `Skill`.

### 4. Server — extend agent skill-linking for `enabled`

- `POST /agents/:id/skills` body becomes `{ links: [{ skill_id, enabled }] }`, ordered
  (order = array index). `AgentsRepository.setSkills` replaces the agent's rows with
  that ordered set, carrying the `enabled` bit. Drops the older `skill_ids` /
  single-`skill_id` body shape (the Skills tab always sends the full ordered list).
- `AgentsRepository.linkedSkills` + `AgentSkillLink` DTO carry `enabled`.
- New `AgentsRepository.enabledSkillsForAgent(agentId)` →
  `{ name, body }[]` where `agent_skills.enabled AND skills.enabled`, ordered by
  `agent_skills.order`. This is the two-level gate: the global skill toggle **and** the
  per-agent toggle must both be on.

### 5. reviewer-core wiring + trace

In `run-executor.ts`, before the `reviewPullRequest` call:
1. `const enabled = await agentsRepo.enabledSkillsForAgent(agent.id)`.
2. Format each as `` `### ${name}\n${body}` `` into `const skills: string[]`
   (labeling keeps the trace block readable and skill boundaries clear to the model).
3. Pass `...(skills.length ? { skills } : {})`.

The engine contract (`skills: string[]`) is **unchanged** — labeling is server-side.
`reviewPullRequest` threads `skills` → `assemblePrompt` → `assembly.skills`, and the
trace already persists `outcome.assembly`. Result: enabled skills appear as a labeled
`## Skills / rules` block in the trace; disabled/global-off skills are absent. No
trace-UI change needed.

### 6. Client — Skills page (`/skills`)

Master-detail, mirroring `/agents`. All server state via TanStack Query hooks
(`lib/hooks/*`) through `lib/api.ts` — never `fetch` from a component.

- **List view**: grid of skill cards (name, `type` badge, description, enabled toggle).
  Clicking a card opens a **right-side preview** panel rendering the markdown body
  (react-markdown). "Add" button → menu with **Create** (Import entry present but
  deferred to the next slice).
- **Editor** at `/skills/[id]`: form with name; description (**field caption:
  "the skill's directive interface — write it as an instruction"**); type select;
  markdown body (textarea + live preview). Create flow mirrors agents' create pattern.
- Hooks: `use-skills` (list), `use-skill` (one), and create / update / delete / toggle
  mutations.

### 7. Client — Agent editor "Skills" tab

- New `SkillsTab` under
  `client/src/app/agents/[id]/_components/AgentEditor/_components/`. `AgentEditor`
  switches Config | Skills on the `tab` value (currently hardcoded to ConfigTab).
- Merges **all workspace skills** (`use-skills`) with the agent's links
  (`GET /agents/:id/skills`) into one ordered, draggable list. Each row: drag handle,
  checkbox (per-agent `enabled`), name, `type` badge. Header shows "N of M enabled".
  Reorder via **native HTML5 drag** (no new dependency). Save → `POST /agents/:id/skills`
  with the full ordered `links` array. Skills created after an agent last saved appear
  appended, unchecked, and get a row on the next save.

### 8. Testing (per `TESTING.md`)

- Server hermetic units: skills service (mocked adapters).
- Server `*.it.test.ts` (testcontainers): skills CRUD + version-bump-on-body-edit;
  agent-link `enabled` round-trip; `enabledSkillsForAgent` respects both toggles + order.
- Server unit: run-executor resolves enabled skills and passes them; disabled and
  global-off skills excluded.
- Client RTL (fetch mocked): SkillsListView (cards + preview), SkillEditor (form +
  markdown preview), SkillsTab (merge, checkbox, reorder, save payload).
- i18n: add `messages/en/skills.json`; extend agents messages for the Skills tab.

## Data flow (review run)

```
Agent editor "Skills" tab
  → POST /agents/:id/skills { links:[{skill_id, enabled}] }  (ordered)
  → agent_skills rows (order, enabled)

Review run (run-executor)
  → enabledSkillsForAgent(agentId)   [agent_skills.enabled AND skills.enabled, ordered]
  → format `### {name}\n{body}`
  → reviewPullRequest({ ..., skills })
  → assemblePrompt → "## Skills / rules" block
  → outcome.assembly → trace.prompt_assembly   (visible in run trace)
```

## Risks / open notes

- **Two-level enable semantics**: a skill is injected iff `skills.enabled` (global,
  card toggle) **and** `agent_skills.enabled` (per-agent). Documented above; enforced in
  `enabledSkillsForAgent`.
- **Skill body edits vs agent version snapshots**: `agent_versions.config.skills`
  stores skill *ids*, not bodies, so replaying an old agent version uses current skill
  bodies. Acceptable for the core loop; note for a future eval-reproducibility slice.
- **Import deferred**: the Skills page "Add" menu shows an Import entry, but it is
  wired in the next slice. Manual skills are trusted content in this slice.
