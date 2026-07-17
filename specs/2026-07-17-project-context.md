# Spec: Project Context  |  Spec ID: 2026-07-17-project-context  |  Status: approved
Supersedes: None

## Problem & why

A repository's specs, docs and insight logs are written for humans and read by nobody at
review time. The reviewer agents already run against every PR with a system prompt, skill
bodies and repo-intel context — but the one artifact that states what the code is *supposed
to do* never reaches them. So a PR that violates an agreed invariant ("`api/` must not
import `db/` directly") sails past a reviewer that had no way to know the rule existed, and
the spec's author finds out at merge, or later.

Today the machinery to fix this is *already built and wired shut*: `reviewer-core` accepts a
`specs` input, wraps each entry as untrusted, renders it as a `## Project context` block and
records it in the run trace (`reviewer-core/src/prompt.ts:116-119,139,158`). The run
executor simply never passes it, and persists `specs_read: []` unconditionally
(`server/src/modules/reviews/run-executor.ts:215-241,311`). Nothing reads the repo's
Markdown, and there is no UI to choose which documents matter to which agent.

If we do nothing, specs stay documentation and the reviewer stays uninformed about intent —
and the empty slot keeps advertising a feature that does not exist.

## Goals / Non-goals

**Goals**
- Discover every Markdown document under the repo's configured context roots and list it,
  with its path, on a read-only **Project Context** page.
- Let a user read each document's rendered Markdown.
- Let a user **manually attach** an ordered subset of those documents to an agent, and to a
  skill, via a `Context` tab that mirrors the existing `Skills` tab.
- Store only **paths** in the agent's/skill's metadata — never the document text.
- At run time, read the attached paths from the clone and fill the existing `## Project
  context` prompt slot, with zero new LLM calls.
- Show, in the run trace, exactly which documents were injected and their token volume, and
  make the injected text readable in Prompt assembly.
- Show a live token estimate in the attach UI, derived from the attached documents.

**Non-goals**
- **Editing documents from the Project Context page** — deliberately deferred, and the
  reason matters: the clone is a `git reset --hard`-managed artifact (`sync()` at
  `server/src/adapters/git/simple-git.ts:77-88`, reachable from `POST /repos/:id/resync`),
  so any edit written into the working tree is silently discarded by the next resync. A
  write path that loses the user's work without telling them is worse than no write path.
  Restoring editing means deciding a real destination (a branch, a commit, a PR) — a feature
  in its own right.
  **This leaves `client/messages/en/context.json`'s `mode.edit`, `editor.save` and
  `editor.saving` keys with no consumer.** Per root `INSIGHTS.md:27` an unused i18n key is a
  scope question, never noise — so the resolution is recorded explicitly rather than left to
  be rediscovered: **editing was intended by the design and is being deferred on purpose,
  because of the resync clobber above.** The keys are the design's standing signal that this
  is unfinished, not dead code to delete.
- **Creating, uploading, or foldering documents from the page toolbar** (the mockup's `+`,
  new-folder and upload icons) — cut for the same reason: they are write paths into the same
  clobbered working tree.
- **Auto-selection of specs per PR** (a selector that picks relevant specs for a given diff)
  — the user judged the relevance mechanism complex and manual selection sufficient to prove
  the loop. Deferred; it is the natural follow-up once attach exists.
- **The L06 merge-blocking conformance agent** — here the reviewer *reads* the spec; a
  dedicated agent verifying implementation against it and blocking merge is a later lesson.
  (`client/messages/en/conformance.json` and the `Conformance` contract at
  `server/src/vendor/shared/contracts/knowledge.ts:12-26` already ship for it; this feature
  must not consume them.)
- **Chunking / retrieval of documents, and the mockup's coverage ring** — a chunk count
  implies a chunk store, which implies embeddings, which are OpenAI calls;
  `EMBEDDINGS_ENABLED` defaults to `false` (`server/src/platform/config.ts:21-22,78`) and
  server `CLAUDE.md` forbids adding OpenAI calls in that state. Attachment is
  whole-document, so no chunk store is required by any goal here. The coverage ring is cut
  because the design states no definition of what it would measure.
- **Any new LLM or embedding call** — discovery, token counting, attach and injection are
  all deterministic and offline.
- **Changing `reviewer-core`** — the `specs` input, the `## Project context` heading, the
  per-document untrusted wrapping and the `assembly.specs` record already exist and are
  correct. Modifying them would break the CI runner that shares the engine.
- **Automatic re-sync of the clone** — nothing re-indexes or re-fetches on its own
  (`server/INSIGHTS.md:44,51`); this feature reads the last-synced snapshot and says so
  rather than introducing a poller.

## User stories

- As a reviewer-owner, I want to see every specification and Markdown document in my project
  on one page, so that I know what grounding material exists.
- As a reviewer-owner, I want to read a document's rendered content, so that I can tell
  whether it is worth attaching.
- As a reviewer-owner, I want to attach an ordered set of documents to an agent, so that its
  reviews are steered by the rules my team actually agreed.
- As a skill author, I want to attach documents to a skill, so that every agent using that
  skill inherits the same grounding without re-attaching it.
- As a reviewer-owner, I want a live token count as I attach, so that I understand how much
  each prompt grows before I run anything.
- As a reviewer-owner, I want the attached documents pulled from the project and injected as
  text when a review runs, so that the reviewer sees the rules.
- As a reviewer-owner, I want the run trace to name the documents that were injected and let
  me open the exact text sent, so that grounding is seen, not guessed.

## Contracts & flows

### Attach (edit time) — paths only

```mermaid
sequenceDiagram
    actor U as User
    participant C as client · Context tab
    participant A as server · context module
    participant FS as repo clone (last-synced)

    U->>C: open Agent ▸ Context
    C->>A: GET /repos/:repoId/context-docs
    A->>FS: walk configured roots for *.md
    FS-->>A: paths + sizes
    Note over A: per-doc token_estimate via<br/>existing Tokenizer port
    A-->>C: ContextDoc[] (path, root, bytes, token_estimate)
    C->>A: GET /agents/:id/context
    A-->>C: ContextAttachment[] (path, order, attached)
    Note over C: estimate summed client-side from<br/>token_estimate — no network call
    U->>C: toggle + reorder + Save
    C->>A: POST /agents/:id/context  { paths in order }
    Note over A: persists PATHS ONLY — never text;<br/>paths join the agent version snapshot
```

### Run time — resolve, guard, inject

```mermaid
sequenceDiagram
    participant RE as run-executor
    participant AR as agents/skills repo
    participant G as path guard
    participant FS as repo clone
    participant PE as reviewer-core · assemblePrompt
    participant T as run_traces

    RE->>AR: skill-inherited paths, then agent-attached
    AR-->>RE: ordered list, deduped by path (first wins)
    loop each path
        RE->>G: lexical + lstat + realpath containment + ext re-check
        alt guard rejects / file missing
            G-->>RE: skip (log; run continues)
        else size > ~5 MB read bound
            G-->>RE: fail run — name document + size (crash guard)
        else ok
            RE->>FS: read document WHOLE (no truncation)
            FS-->>RE: text
        end
    end
    RE->>PE: specs: string[]  (EXISTING input)
    Note over PE: each entry → wrapUntrusted('spec-N', …)<br/>rendered as `## Project context`<br/>recorded at assembly.specs
    PE-->>RE: messages + assembly
    alt assembled prompt exceeds model context window
        RE->>T: fail, naming project context + its token contribution
    else fits
        RE->>T: specs_read: injected paths + prompt_assembly.specs
    end
```

### Contracts

| Contract | Direction | Shape | Notes |
|---|---|---|---|
| `GET /repos/:repoId/context-docs` | client → server | `{ docs: [{ path, root, bytes, token_estimate, used_by_agents }], clone: { synced_at, present } }` — `root` ∈ `specs\|docs\|insights` | **New.** `path` is repo-relative. `clone.present=false` when `clonePath` is null → AC-2. |
| `GET /repos/:repoId/context-docs/content?path=` | client → server | `{ path, text }` | **New.** Path-guarded (AC-15). Powers Preview. Read-only — there is no write counterpart. |
| `GET /agents/:id/context` | client → server | `ContextAttachment[]` — `{ agent_id, path, order, attached }` | **New.** Mirrors `GET /agents/:id/skills` (`server/src/modules/agents/routes.ts:133`). |
| `POST /agents/:id/context` | client → server | `{ docs: [{ path, attached }] }` in display order | **New.** Set/reorder the full set — mirrors `POST /agents/:id/skills` (`routes.ts:141`), not a per-row PUT. |
| `GET` / `POST /skills/:id/context` | client → server | as above, keyed `skill_id` | **New.** Same shape; skill-level attachments are inherited by every agent using the skill. |
| `Tokenizer` port — `count(text)` | server internal | `TiktokenTokenizer` (js-tiktoken, `cl100k_base`, lazy, falls back to `approxTokens` = `ceil(chars/4)`) | **EXISTS** — `server/src/adapters/tokenizer/index.ts:16-40`; `js-tiktoken` already a dep (`server/package.json:32`); already wired through DI (`container.ts:33,55,81`); already used to count diff tokens (`intent/service.ts:137-138`). **Scope boundary — see Non-functional.** |
| `ReviewInput.specs` | server → reviewer-core | `string[]` | **EXISTS — do not change.** `reviewer-core/src/review/run.ts:60,140`. |
| `PromptAssembly.specs` | reviewer-core → trace | `string \| null` | **EXISTS.** `contracts/trace.ts:39-53`; populated at `prompt.ts:158`. Currently always `null` in practice. |
| `RunTrace.specs_read` | server → client | `string[]` | **EXISTS, hardcoded `[]`.** `contracts/trace.ts:86`; `run-executor.ts:311,461`. This feature fills it. |
| `AgentVersionConfig` | server internal | gains context doc paths alongside `skills: string[]` | **EXISTS** (`contracts/knowledge.ts:307-317`) — extended so an eval replay reconstructs the prompt the run actually saw (AC-27). |
| `AgentSkillLink` | — | `{ agent_id, skill_id, order, enabled }` | **EXISTS** (`contracts/knowledge.ts:294-300`) — the shape precedent for `ContextAttachment`. |

The `ContextAttachment` / `ContextDoc` DTOs are genuinely new: no shape for them ships in
`server/src/vendor/shared/contracts/` or `client/src/vendor/shared/contracts/` (grepped).
Per root `INSIGHTS.md:26`, both vendored copies must receive them in the same commit.

## Acceptance criteria (EARS)

**Discovery — the Project Context page**

- **AC-1** — WHEN a user opens the Project Context page for a repo, the system SHALL list
  every `.md` file in that repo's local clone lying at any depth beneath a `specs`, `docs` or
  `insights` directory, showing each document's repo-relative path and a badge naming which
  of the three roots it came from. The root set SHALL be server-configured, with those three
  as the default.
- **AC-2** — IF the repo has no local clone (`clonePath` is null) or the clone root is
  unreadable, THEN the system SHALL render an empty state that names that reason and offers
  the Resync action, rather than an unexplained empty list.
- **AC-3** — IF the configured roots contain no `.md` file, THEN the system SHALL render an
  empty state naming the roots that were searched, and that copy SHALL describe the
  manual-attach model — it SHALL NOT claim that documents are read automatically by every
  agent or by the PR brief.
- **AC-4** — The system SHALL present the document list as a snapshot of the **last-synced**
  clone, and SHALL display a footer reading document count, aggregate token estimate, and
  the time since that sync — because no clone refresh or re-index happens automatically.
- **AC-5** — WHILE the document list request is in flight, the system SHALL render a loading
  state; IF the request fails, THEN the system SHALL render the load-error state with a
  retry affordance.
- **AC-6** — WHEN a user selects a document, the system SHALL render its Markdown content
  read-only, and SHALL NOT offer any affordance to edit, create, upload, or delete a
  document.
- **AC-26** — The system SHALL display, per document, how many agents currently attach it.

**Attach — the Context tab (agent and skill)**

- **AC-7** — WHEN a user opens an agent's `Context` tab, the system SHALL list every
  discovered document as a row carrying a drag handle, an attach checkbox, the filename, its
  repo-relative directory, its root badge, and a Preview affordance, ordered by the agent's
  stored order with unattached documents following attached ones.
- **AC-8** — The system SHALL display the count of attached documents against the total
  discovered (e.g. "2 of 7 attached").
- **AC-9** — WHEN a user types in the document filter, the system SHALL narrow the visible
  rows without changing any document's stored order or attached state.
- **AC-10** — WHEN a user reorders, toggles, and saves the `Context` tab, the system SHALL
  persist for that agent only the document **paths**, their order, and their attached flag —
  and SHALL NOT persist any document's text.
- **AC-11** — WHEN a user saves a skill's `Context` tab, the system SHALL persist the same
  path-only attachment set against the skill, and every agent with that skill enabled SHALL
  inherit those documents at run time.
- **AC-12** — WHEN the attached set changes in the `Context` tab, the system SHALL update the
  displayed token estimate from the per-document estimates already fetched with the document
  list, without issuing a network request and without any model or embedding call.
- **AC-13** — The system SHALL present the token figure as an approximation (e.g. `≈ 317
  tokens`) and never as an exact count, because the available encoder (`cl100k_base`) is not
  the encoding used by the models the agents actually run (e.g. `gpt-4.1`,
  `openrouter/deepseek`), which tokenize the same text differently.
- **AC-28** — The system SHALL state, in the attach UI, that the documents are injected as an
  untrusted block into every run of that agent, and any serialization preview it shows SHALL
  name the heading the prompt actually uses (`## Project context`).

**Run time — injection**

- **AC-14** — WHEN a review run executes for an agent, the system SHALL assemble the injected
  document list as the paths inherited from its enabled skills first, followed by the agent's
  own attached paths, deduplicated by path so that a document attached at both levels is
  injected exactly once at its first position; and SHALL pass the resulting documents to the
  review engine's existing `specs` input in that order.
- **AC-15** — The system SHALL resolve every attached path against the clone root using the
  established guard sequence — lexical containment, reject a symlinked leaf, realpath
  containment of both root and target, and re-check the extension allowlist against the real
  path — before reading any bytes.
- **AC-16** — IF an attached path fails any containment or symlink check, THEN the system
  SHALL skip that document, record the skip in the run log, and continue the run without
  reading it.
- **AC-17** — IF an attached document is absent, unreadable, or renamed on disk at run time,
  THEN the system SHALL skip it, surface it as skipped in the run trace, and complete the
  run — a missing document SHALL NOT fail the review.
- **AC-18** — IF the assembled prompt exceeds the target model's context window, THEN the
  system SHALL fail the run with a reason that names the project-context block and its token
  contribution, rather than surfacing a generic model error — so that an overflow caused by
  attached documents is legible as such and not mistaken for a model bug.
- **AC-29** — IF an attached document's size on disk exceeds the per-document read bound of
  ~5 MB, THEN the system SHALL fail the run with a reason naming that document and its size,
  and SHALL NOT read the file into memory. This bound is a **crash guard, not a token
  budget** — the two are separate concerns and MUST NOT be collapsed into one limit (see
  Non-functional › Security). A long document the user consciously attached SHALL still
  reach the model in full: nothing below this bound is truncated, trimmed, or sampled.
- **AC-19** — The system SHALL make zero additional LLM, embedding, or network calls to
  discover, count, attach, or inject documents.
- **AC-20** — WHERE an agent has no attached documents and inherits none, the system SHALL
  assemble a prompt byte-identical to the prompt assembled before this feature existed.
- **AC-21** — The system SHALL wrap every injected document as untrusted content within the
  `## Project context` block, and SHALL NOT weaken or bypass the injection guard applied to
  the system prompt.
- **AC-27** — WHEN an agent's context attachments change, the system SHALL record the
  attached document paths in that agent's version config snapshot alongside its linked
  skills, so that replaying a past version reconstructs the prompt that version actually
  produced.

**Run time — visibility**

- **AC-22** — WHEN a run completes having injected at least one document, the system SHALL
  record each injected document's repo-relative path in the trace's `specs_read`, and the
  trace's Configuration card SHALL display them in its `Specs read` row.
- **AC-23** — WHEN a user opens a completed run's Prompt assembly, the system SHALL list a
  `Project context — attached specs (untrusted)` entry, expandable to reveal the exact text
  that was sent to the model for that run, and copyable.
- **AC-24** — The system SHALL display the token volume attributable to the injected
  `## Project context` block in the run trace.
- **AC-25** — WHEN a document stating an invariant is attached to an agent and that agent
  reviews a PR violating that invariant, the assembled prompt for that run SHALL contain the
  invariant's text inside the `## Project context` block. This containment is the release
  gate and is decidable by a test. Whether the reviewer then *cites* the document in a
  finding is model-dependent and is **not machine-checkable** — it is the feature's manual
  demonstration, not a criterion any test can enforce.

## Edge cases

| Case | Expected behavior | Criterion |
|---|---|---|
| Repo has no clone yet (`clonePath` null) | Empty state names the reason, offers Resync — never a bare empty list | AC-2 |
| Configured roots exist but hold no `.md` | Empty state naming the roots searched, describing manual attach | AC-3 |
| Clone is stale (nothing auto-syncs) | Footer labels the list as the last-synced snapshot with its age | AC-4 |
| Degraded **and** empty at once (no clone → no docs) | The reason renders inside the empty branch, not after an early return (`client/INSIGHTS.md:32`) | AC-2 |
| List request fails / is slow | Load-error state with retry; loading state while in flight | AC-5 |
| Doc attached, then deleted or renamed on disk before the run | Skipped, surfaced as skipped in the trace, run completes | AC-17 |
| Doc attached, then replaced by a symlink to `~/.devdigest/secrets.json` | Rejected by the realpath/lstat guard; never read | AC-15, AC-16 |
| Attached path escapes the clone via `..` or an absolute path | Rejected by lexical containment | AC-15, AC-16 |
| Long doc attached (a genuinely large spec) | Injected **whole** — there is no token cap and nothing is truncated. The live token estimate is the user's pre-flight warning; if the assembled prompt overflows the model's window the run fails naming project context as the cause | AC-12, AC-18 |
| Absurd file attached (e.g. a 500 MB file committed under `docs/`) | Refused at the read bound before any bytes are buffered; run fails naming the document and its size. This is a crash guard firing, not a budget — it sits far above any real document | AC-29 |
| Same doc attached to both the agent and one of its enabled skills | Deduped by path, injected once, at its first (skill-inherited) position | AC-14 |
| Agent has nothing attached and inherits nothing | Prompt byte-identical to today's | AC-20 |
| Doc containing `</untrusted>` or prompt-injection text | Wrapped as untrusted; delimiter escaped; guard intact | AC-21 |
| Filter active while user reorders | Order/attached state unaffected by the display-only filter | AC-9 |
| A spec's `#`/`##` headings render flat in Preview | Known limitation, not a bug to chase: the vendored `Markdown` primitive styles only `p`/`strong`/`code`/`a`, and its `.dd-md` hook has no CSS anywhere (`client/INSIGHTS.md:11`). Real heading hierarchy would mean editing the sealed `vendor/ui` copy — a deliberate design-system change, out of scope | AC-6 |

## Non-functional

- **Performance** — Discovery walks the clone's `specs`/`docs`/`insights` roots only, not the
  whole tree. The document list SHALL return within 400 ms p95 for a repo with ≤ 200 matching
  documents. Token estimation on toggle is a client-side arithmetic pass over already-fetched
  per-document estimates (AC-12), so it SHALL not re-fetch or re-encode.
- **Security** — Attached documents are read from a clone whose contents any PR author can
  influence. Every read is path-guarded exactly as the intent module's plan/spec reads are
  (`server/src/modules/intent/service.ts:90-115`; reasoning recorded in
  `server/INSIGHTS.md:41`): a lexical guard **alone is insufficient** because a committed
  symlink — or a symlinked parent directory — resolves lexically inside the root while its
  real target is anywhere on disk, including the secrets store. The extension allowlist is
  therefore re-derived from the realpath'd target, never the lexical name.
  **Two limits that look like one, and must never be collapsed back together.** The intent
  module's `PLAN_SPEC_MAX_BYTES = 16 KB` (`intent/constants.ts:5`) silently does two
  different jobs — it is a *token budget* and a *memory-exhaustion guard*. This feature
  separates them deliberately, and the separation is the requirement:
  - **There is no token budget.** It was removed on purpose. A long specification the user
    consciously attached is exactly the thing this feature exists to deliver, and it MUST
    reach the model in full — never truncated, trimmed, sampled, or summarised. If it does
    not fit, the run fails and says so (AC-18); it does not quietly send less than the user
    asked for. A silent truncation here is worse than a failure, because the reviewer would
    then be steered by half a rule while the UI claims the document was injected.
  - **There is a ~5 MB per-document read bound** (AC-29), which is a **crash guard only**. Its
    job is to stop an unbounded read of an attacker-influenceable file from exhausting server
    memory — the file's bytes are chosen by whoever can land a commit, and a read happens
    *before* any prompt exists, so AC-18 cannot protect against it. It is sized far above any
    real document and far below an OOM, so in normal operation it never fires. If it does
    fire, the reason names the document and its size (AC-29) rather than surfacing as a
    generic failure or an OOM crash.

  Sizing one of these from the other is the mistake to avoid: shrinking the read bound toward
  a "sensible token size" would silently reintroduce the budget the user removed, and the
  symptom — specs quietly not reaching the reviewer — is the exact failure this whole feature
  exists to prevent.

  The asymmetry with AC-17 is intentional: a *missing* document degrades (skip, surface,
  complete) because its absence is usually a stale attachment, while an *oversized* one fails
  loudly because it is a live misconfiguration the user must see and fix.

  Injected text is untrusted **data, never instructions** (AC-21). Attachment endpoints are
  workspace-scoped: per `server/INSIGHTS.md:38`, a table keyed only on `agent_id`/`skill_id`
  with no `workspace_id` is an IDOR trap, so every read reachable from a route must join to
  the owning entity and filter on its workspace.
- **Accessibility** — The Context row's drag handle and Preview control are real, separately
  focusable controls; the row SHALL NOT nest interactive elements inside another interactive
  container (`client/INSIGHTS.md:46`). The attach checkbox SHALL carry an accessible name
  identifying its document. Reorder SHALL be reachable without a pointer.
- **Module boundary (a decision for the planner, named here so it cannot be crossed by
  accident)** — the `Tokenizer` adapter this feature relies on declares its own scope as
  "in-process, **ONLY under modules/repo-intel**" (`server/src/adapters/tokenizer/index.ts:11`).
  Consuming it from a project-context module widens a deliberately-drawn boundary. This spec
  requires an offline token estimate (AC-12, AC-13) and records that a suitable port already
  exists and is DI-wired; **whether to widen that scope, or to reach the same estimate
  another way, is the planner's call to make consciously.**

## Inputs (provenance)

- Repo clone working tree (`repos.clonePath`, nullable) — [reused: L02–L04 clone/resync] —
  the Markdown documents themselves and their sizes.
- Context roots (`specs` / `docs` / `insights` at any depth; server-configured, with those
  three as the default set) — [deterministic: config] — bounds discovery.
- Agent/skill context attachments (paths + order) — [new: DB, no model] — which documents
  this run injects.
- `Tokenizer` port (`count(text)`; `cl100k_base` with a `ceil(chars/4)` fallback) —
  [reused: repo-intel adapter] — per-document token estimates.
  `server/src/adapters/tokenizer/index.ts:16-40`, wired at `container.ts:33,55,81`.
- `reviewer-core` `specs` prompt input + `## Project context` renderer + `assembly.specs` —
  [reused: L02–L04] — `reviewer-core/src/prompt.ts:116-119,139,158`.
- `RunTrace.specs_read` / `PromptAssembly.specs` — [reused: L02–L04] — the trace fields this
  feature finally populates (`contracts/trace.ts:53,86`).
- Path guard (`safeRepoPath`, `isRealPathContained`, extension allowlist) — [reused: intent
  module] — `server/src/modules/intent/helpers.ts:103,122`.
- **Zero new model calls.** No embedding call, no structured call, no tokenizer service.

## Untrusted inputs

- **Attached Markdown documents from the repo clone** — the project did not author them in
  any trustworthy sense: a PR author can add, edit, or symlink a file under `specs/`,
  `docs/` or `insights/`, and this feature's whole purpose is to place that text in a
  reviewer's prompt. That makes them a prime injection vector, and a *deliberate* one — the
  document is meant to steer the reviewer, so "it changed the review" is indistinguishable
  from "it hijacked the review" unless the trust boundary holds. Handling: each document is
  wrapped in the engine's untrusted delimiter with `</untrusted>` escaped, rendered as
  `## Project context` in the **user** message (never the system message), and the injection
  guard stays on the system side (AC-21). No keyword scanning — the guard is the defense.
- **The attached file's path and its real target on disk** — attacker-influenceable, and a
  path is not the file it names: a `.md` leaf can be a symlink to `~/.devdigest/secrets.json`
  (mode 0600, outside the clone). Handling: guard sequence of AC-15 — the extension
  allowlist is re-derived from the **realpath'd** target, not the lexical name.
- **Document content rendered in Preview in the browser** — untrusted Markdown rendered to a
  user. Handling: rendered through the existing vendored Markdown primitive, which does not
  enable raw HTML; no `dangerouslySetInnerHTML` path is introduced.

Not untrusted: the attachment records themselves (paths + order authored by the user in our
own UI), which are validated against the discovered document set on write.

## [NEEDS CLARIFICATION]

None — every question raised while drafting has been put to the user and answered, and each
answer is folded into the criteria above. This is not a claim that the spec is complete: it
means the agent that wrote it has no *known* open questions, which says nothing about one it
failed to think of. That gap is what a human reading the spec is here to close, and it is why
`Status:` stays `draft` until someone ratifies it.
