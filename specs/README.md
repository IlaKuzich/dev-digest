# specs — cross-module specifications

**Only specs that span two or more packages/modules live here.** A spec confined to a
single package belongs in that package's own `specs/` directory, next to the code it
describes.

| Feature touches | Spec goes to |
|---|---|
| Two or more packages/modules | **`specs/`** (this directory) |
| `server/` only | `server/specs/` |
| `client/` only | `client/specs/` |
| `reviewer-core/` only | `reviewer-core/specs/` |

Written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent, which is confined
to these four directories by a hook and cannot write anywhere else in the repository.

## What a spec is

A spec states **what** the system must do and **why** — never **how** to build it. That is
the [`implementation-planner`](../.claude/agents/implementation-planner.md)'s job; it reads
an approved spec as its input and turns it into task contracts.

Specs may carry schemas, workflows, cross-module communication and contracts, but as
**shape without syntax** — field names, types, semantics, HTTP method and path, in tables
and mermaid diagrams. Never code, and never a decision that belongs to the planner.

Every acceptance criterion is written in **EARS** form (`WHEN … SHALL`, `IF … THEN …
SHALL`, `WHILE … SHALL`, `WHERE … SHALL`, or a plain `SHALL`), in English, with an ID
(`AC-1`, `AC-2`, …) so tests, plans and reviews can cite it.

## Naming

`<YYYY-MM-DD>-<slug>.md` — and the **Spec ID inside the file is the filename** without the
extension:

```
specs/2026-07-17-onboarding-reading-path.md   →   Spec ID: 2026-07-17-onboarding-reading-path
```

The date makes specs sort and search chronologically; there is no counter to reserve, so
two specs written the same day cannot collide.

## Status

`draft` → `approved` → `implemented`, in the file's header line.

- `spec-creator` writes `draft`, and may raise it to `approved` once it has no open
  `[NEEDS CLARIFICATION]` questions left.
- **`approved` means the agent has no open questions — not that a human ratified it.** Read
  the spec before treating the label as a gate.
- `implemented` is set by a human: it is a fact about the code, not about the spec.

`implementation-planner` **refuses to plan** a spec that is still `draft` or still carries a
`[NEEDS CLARIFICATION]` line — an unanswered question planned around becomes an answer nobody
gave.

## Changing an existing spec

**AC IDs are permanent.** Plans map `AC-N` to tasks, tests cite it, and `plan-verifier`
traces it — so renumbering or repurposing a criterion silently re-points every reference at
something that changed underneath it.

| Spec status | The change | What to do |
|---|---|---|
| any | Typo / wording with identical meaning | Edit in place |
| `draft` | Anything | Edit in place |
| `approved`, not yet built | Adds a requirement | Append a new `AC-N` |
| `approved`, not yet built | Alters or removes an agreed `AC-N` | New spec, `Supersedes:` the old |
| `implemented` | Any behavioral change | New spec, `Supersedes:` the old |

A superseded spec stays as it was written. It records what was agreed and built at the time,
and the shipped code still matches it.

## Not to be confused with

| Directory | Owner | Holds |
|---|---|---|
| `e2e/specs/` | e2e package | `*.flow.json` deterministic browser flows — not prose specs |
| `docs/specs/` | `doc-writer` | Documentation of **shipped** features |
| `docs/superpowers/specs/` | `doc-writer` | Dated design explorations written before a plan |

The distinction that matters: **`specs/` describes what is not built yet; `docs/` describes
what already works.**
