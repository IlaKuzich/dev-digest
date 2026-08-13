---
name: design-assets
description: Preserve a spec's DESIGN REFERENCE files (mockups, screenshots, wireframe exports, design PDFs) — including images pasted directly into chat, extracted from the current session's transcript — by copying them into the spec's dedicated `assets/<spec-id>/` folder, so `implementation-planner` and `implementer` can open the real pixels from their cold contexts. Run this in the ORCHESTRATOR session — NOT inside `spec-creator`, which by design cannot write binaries. Invoke via `/design-assets` with a spec path/ID and the reference files (or "the pasted images" for chat-pasted ones), or when the user says to "save/attach/stash the design/mockup/screenshots for a spec". Design references only — it refuses source code, config, and arbitrary files.
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
| **The reference file(s)** | Paths on disk the user names, OR "the pasted images" / "from this session" — see **Chat-pasted images** below, no path needed for those. A folder is fine — take the design-reference files inside it, per the one rule. |

## Chat-pasted images (no file on disk — extract from the session transcript)

A chat-pasted image looks like it has nothing to copy, but it does: Claude Code embeds every
pasted image as base64 inside the **current session's own transcript** —
`~/.claude/projects/<project-slug>/$CLAUDE_CODE_SESSION_ID.jsonl`, one JSON line per turn,
image blocks at `message.content[].type == "image"` with `source.type == "base64"`. You hold
`Bash`, so you can decode those bytes back into real files. `spec-creator` cannot — no `Bash`,
and `Write` emits text only — which is exactly why this stays the orchestrator's job, same as
file-based sources.

**Steps:**
1. **Locate the transcript by session ID, never by guessing the project-slug encoding:**
   ```bash
   transcript=$(find "$HOME/.claude/projects" -mindepth 2 -maxdepth 2 \
     -name "${CLAUDE_CODE_SESSION_ID}.jsonl" | head -1)
   ```
2. **Extract every image block from `user` turns, in order**, to a scratch folder (the
   session scratchpad, not the repo):
   ```bash
   scratch_dir="/path/to/session/scratchpad"   # use this session's actual scratchpad dir
   python3 - "$transcript" "$scratch_dir" <<'PY'
   import json, sys, base64, pathlib
   out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
   ext = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
   i = 0
   with open(sys.argv[1]) as f:
       for line in f:
           obj = json.loads(line)
           if obj.get("message", {}).get("role") != "user":
               continue
           content = obj["message"].get("content")
           if not isinstance(content, list):
               continue
           for block in content:
               src = block.get("source", {}) if block.get("type") == "image" else None
               if src and src.get("type") == "base64":
                   i += 1
                   data = base64.b64decode(src["data"])
                   fn = out / f"pasted-{i}.{ext.get(src.get('media_type'), 'png')}"
                   fn.write_bytes(data)
                   print(fn)
   PY
   ```
3. **List what you found before copying anything** — index, file, rough size — and confirm
   with the human which ones are genuine design references for *this* spec. The user asked
   this skill to pull in **every image pasted during the session**, which is deliberately
   over-inclusive: a long session also pastes debug screenshots, terminal output, unrelated
   crops. "Extracted" is not "confirmed relevant" — copying all of it into `assets/<spec-id>/`
   unfiltered pollutes the spec with noise a cold-context implementer will mistake for
   intended UI. Drop anything the human doesn't confirm.
4. **Copy the confirmed ones** into `assets/<spec-id>/` via the normal Steps below, naming
   them for what they show (`dashboard-empty-state.png`), never `pasted-1.png`.
5. Delete the scratch extraction folder once copied — it was a working copy, not the record.

This reaches into Claude Code's own transcript storage format, which is internal and can
change between CLI versions. If the `find`/parse comes back empty on a session you know
pasted images in, don't conclude there are none — say the extraction failed and fall back to
asking the user to save the image to a file on disk and re-run this skill with the path.

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
