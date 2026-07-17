---
name: design-assets
description: Preserve a spec's DESIGN REFERENCE files (mockups, screenshots, wireframe exports, design PDFs) by copying them into the spec's dedicated `assets/<spec-id>/` folder, so `implementation-planner` and `implementer` can open the real pixels from their cold contexts. Run this in the ORCHESTRATOR session — NOT inside `spec-creator`, which by design cannot write binaries. Invoke via `/design-assets` with a spec path/ID and the reference files, or when the user says to "save/attach/stash the design/mockup/screenshots for a spec". Design references only — it refuses source code, config, and arbitrary files.
---

# /design-assets — put design references where every agent can see them

You are running in the **orchestrator session** (the one the human drives), which has a shell.
Your job is narrow: **copy design reference files into a spec's `assets/<spec-id>/` folder**
and hand back the markdown snippet that links them from the spec.

## Why this skill exists (the reason it is a skill, not an agent capability)

`spec-creator` reads design sources — `Read` renders an image — but it **cannot save them**:
its tools are `Read, Grep, Glob, Edit, Write, Skill, Agent`, no `Bash`, and `Write` emits
text only. That is deliberate. `Bash` is withheld precisely so its `Write|Edit` write-scope
hook (specification-markdown only) is a real barrier and not a convention — see
`.claude/hooks/spec-creator-write-scope.sh`. Give the agent a way to copy binaries and that
barrier collapses.

So the copy is routed **around** the agent instead of through it. You — the orchestrator —
already have the shell, so you do the placement; `spec-creator`'s barrier stays fully intact
and it only ever *references* the folder. Downstream, `implementation-planner` (`Read`) and
`implementer` (`Read`) both render images, so raw files in the repo are exactly what a
cold-context agent needs — the one hard part was getting the bytes onto disk, and that is
this skill.

## The one rule

**Design references only.** This skill places mockups, screenshots, wireframe/Figma exports,
and design PDFs — the visual sources a reviewer would look at to understand the intended UI.
It is **not** a general file-mover. Refuse anything that is not a design reference: never copy
source code, config, `.env`, data dumps, or arbitrary documents with it. If asked, say so and
stop — that is scope this skill does not have.

Allowed extensions: `.png .jpg .jpeg .gif .webp .svg .avif .pdf`. Anything else → refuse and
ask the user to confirm it is genuinely a design reference before you place it by hand.

## Input

Invoked as `/design-assets`, arguments arrive in `$ARGUMENTS`; otherwise take them from the
request. You need two things — find them, don't guess:

| You need | How to get it |
|---|---|
| **The spec** | A path (`specs/2026-07-17-foo.md`) or a Spec ID (`2026-07-17-foo`). `Glob` the four specs dirs if given only an ID. |
| **The reference file(s)** | Paths on disk the user names. A folder is fine — take the design-reference files inside it, per the one rule. |

**A chat-pasted image is not a file** and this skill cannot place it — there is nothing on
disk to copy. Say so: the design detail must instead be transcribed into the spec's
`## Design sources` section (that is `spec-creator`'s job, from what it can see).

## Where the assets go — mirror the spec's own location

The assets folder is a **sibling `assets/<spec-id>/` next to the spec file**, so the spec can
link it with a stable relative path from any package:

| Spec lives at | Assets go to | Spec links them as |
|---|---|---|
| `specs/<id>.md` | `specs/assets/<id>/` | `./assets/<id>/<file>` |
| `server/specs/<id>.md` | `server/specs/assets/<id>/` | `./assets/<id>/<file>` |
| `client/specs/<id>.md` | `client/specs/assets/<id>/` | `./assets/<id>/<file>` |
| `reviewer-core/specs/<id>.md` | `reviewer-core/specs/assets/<id>/` | `./assets/<id>/<file>` |

The relative link is identical everywhere because the folder is always a sibling — that is the
point of mirroring the location rather than centralizing.

## Steps

1. **Resolve the spec.** Turn the argument into a real spec path (`Glob` if you got an ID).
   If no spec file exists yet, that is fine — the folder can precede the spec; just derive the
   Spec ID from the filename-to-be and the intended location, and confirm with the user.
2. **Filter to design references** (the one rule). Drop — and report — anything outside the
   allowed extensions rather than copying it.
3. **Create the folder and copy**, preserving each file's basename. Kebab-case a name only if
   it has spaces or is uninformative (`Screenshot 2026-07-17 at 14.02.png` →
   `dashboard-empty-state.png`); otherwise keep it. Do not overwrite an existing asset without
   saying so.
   ```bash
   dest="specs/assets/2026-07-17-foo"        # ← the sibling folder from the table above
   mkdir -p "$dest"
   cp "/path/to/mockup.png" "$dest/dashboard.png"
   ```
   (PowerShell: `New-Item -ItemType Directory -Force $dest; Copy-Item <src> "$dest/<name>"`.)
4. **Report the reference snippet** for the spec's `## Design sources` section — do NOT edit
   the spec yourself here; `spec-creator` owns it and will fold these links in (or you paste
   them if the spec already exists and the user asks):
   ```markdown
   ## Design sources
   - ![Dashboard — empty state](./assets/2026-07-17-foo/dashboard.png) — user-supplied mockup
   ```
5. **Hand off.** Tell the user the files landed, list them, and remind them that `spec-creator`
   should reference `./assets/<id>/…` in `## Design sources`, and that the planner/implementer
   will open them from there.

## What this skill does NOT do

- **It does not write or edit the spec.** That is `spec-creator`'s scope; you only place files
  and return the snippet. Keeping the write barrier meaningful is the whole reason you exist.
- **It does not run inside a subagent.** If you find yourself invoked from within `spec-creator`
  or any writer agent, stop — that agent lacks the shell to copy binaries, and routing the copy
  through it defeats the barrier. It belongs in the orchestrator session only.
- **It does not move non-design files.** See the one rule.
