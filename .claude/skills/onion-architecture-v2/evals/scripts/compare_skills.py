#!/usr/bin/env python3
"""Compare two versions of the onion-architecture skill on evals/evals.json.

Runs every eval twice — once with each skill's SKILL.md loaded — grades both
reviews against the eval's `expectations`, and prints a side-by-side pass
table. Defaults to comparing v1 (.claude/skills/onion-architecture) against
v2 (.claude/skills/onion-architecture-v2), the two skill versions that ship
in this repo, but --skill-a/--skill-b accept any SKILL.md path so future
versions can be compared the same way.

Usage:
    python3 compare_skills.py                     # v1 vs v2, all 10 evals
    python3 compare_skills.py --only fake-port-not-wired
    python3 compare_skills.py --skill-a path/to/SKILL.md --skill-b path/to/other/SKILL.md
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

V2_DIR = Path(__file__).resolve().parents[2]
SKILLS_DIR = V2_DIR.parent
EVALS_JSON = V2_DIR / "evals" / "evals.json"
DEFAULT_SKILL_A = SKILLS_DIR / "onion-architecture" / "SKILL.md"
DEFAULT_SKILL_B = SKILLS_DIR / "onion-architecture-v2" / "SKILL.md"


def find_project_root() -> Path:
    current = Path.cwd()
    for parent in [current, *current.parents]:
        if (parent / ".claude").is_dir():
            return parent
    return current


def run_claude(prompt: str, cwd: Path, model: str | None, timeout: int) -> str:
    cmd = ["claude", "-p", prompt, "--output-format", "json"]
    if model:
        cmd += ["--model", model]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"claude -p failed (exit {proc.returncode}): {proc.stderr[-2000:]}")
    data = json.loads(proc.stdout)
    return data.get("result", "")


def resolve_fixture_root(eval_item: dict) -> Path:
    """Fixture paths in evals.json are relative to v2's dir; the first
    non-_shared file's directory is the module under review."""
    for f in eval_item["files"]:
        if "/_shared/" not in f:
            return (V2_DIR / Path(f)).parent
    return (V2_DIR / Path(eval_item["files"][0])).parent


def review_prompt(eval_item: dict, skill_md: Path) -> str:
    fixture_dir = resolve_fixture_root(eval_item)
    shared_note = ""
    shared_files = [f for f in eval_item["files"] if "/_shared/" in f]
    if shared_files:
        shared_note = "\nShared base file (absolute path): " + str((V2_DIR / Path(shared_files[0])).resolve())
    return (
        f"Read the skill at {skill_md} first and follow its guidance.\n\n"
        f"{eval_item['prompt']}\n\n"
        f"The module's absolute path is: {fixture_dir.resolve()}"
        f"{shared_note}\n"
        "Read every relevant .ts file before reviewing. "
        "Write your full review as plain text in your final answer."
    )


def grading_prompt(eval_item: dict, review_text: str) -> str:
    assertions = "\n".join(f"- {a}" for a in eval_item["expectations"])
    return (
        "You are grading a code review against a fixed list of assertions. "
        "For each assertion, decide PASS or FAIL based only on whether the "
        "review text below satisfies it, and cite the exact sentence as "
        "evidence. Respond with ONLY a JSON object, no prose, no markdown "
        "fences, matching this shape:\n"
        '{"expectations":[{"text":"...","passed":true,"evidence":"..."}],'
        '"summary":{"passed":N,"failed":N,"total":N,"pass_rate":0.0}}\n\n'
        f"Assertions:\n{assertions}\n\n"
        f"Review text:\n---\n{review_text}\n---"
    )


def run_one(eval_item: dict, skill_md: Path, project_root: Path, model: str | None, timeout: int, out_dir: Path, label: str) -> dict:
    print(f"[{eval_item['name']}] reviewing with {label}...", file=sys.stderr)
    review = run_claude(review_prompt(eval_item, skill_md), project_root, model, timeout)
    (out_dir / f"{eval_item['name']}.{label}.review.md").write_text(review)

    print(f"[{eval_item['name']}] grading {label}...", file=sys.stderr)
    grading_raw = run_claude(grading_prompt(eval_item, review), project_root, model, timeout)
    try:
        grading = json.loads(grading_raw)
    except json.JSONDecodeError:
        n = len(eval_item["expectations"])
        grading = {
            "expectations": [],
            "summary": {"passed": 0, "failed": n, "total": n, "pass_rate": 0.0},
            "parse_error": grading_raw[:500],
        }
    (out_dir / f"{eval_item['name']}.{label}.grading.json").write_text(json.dumps(grading, indent=2))
    return grading["summary"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--skill-a", default=str(DEFAULT_SKILL_A), help="path to first skill's SKILL.md (default: v1)")
    ap.add_argument("--skill-b", default=str(DEFAULT_SKILL_B), help="path to second skill's SKILL.md (default: v2)")
    ap.add_argument("--label-a", default="v1")
    ap.add_argument("--label-b", default="v2")
    ap.add_argument("--model", default=None)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--only", default=None, help="run a single eval by its `name`")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    evals = json.loads(EVALS_JSON.read_text())["evals"]
    if args.only:
        evals = [e for e in evals if e["name"] == args.only]
        if not evals:
            sys.exit(f"no eval named {args.only!r} in {EVALS_JSON}")

    project_root = find_project_root()
    out_dir = Path(args.out) if args.out else V2_DIR / "evals" / "ci-runs" / time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for ev in evals:
        a = run_one(ev, Path(args.skill_a), project_root, args.model, args.timeout, out_dir, args.label_a)
        b = run_one(ev, Path(args.skill_b), project_root, args.model, args.timeout, out_dir, args.label_b)
        rows.append({"name": ev["name"], args.label_a: a, args.label_b: b})

    total_a = sum(r[args.label_a]["passed"] for r in rows)
    total_b = sum(r[args.label_b]["passed"] for r in rows)
    total = sum(r[args.label_a]["total"] for r in rows)

    summary = {"rows": rows, "totals": {args.label_a: total_a, args.label_b: total_b, "out_of": total}}
    (out_dir / "comparison.json").write_text(json.dumps(summary, indent=2))

    name_w = max(len(r["name"]) for r in rows) + 2
    print(f"\n{'eval':{name_w}s} {args.label_a:>8s} {args.label_b:>8s}")
    for r in rows:
        print(f"{r['name']:{name_w}s} {r[args.label_a]['passed']}/{r[args.label_a]['total']:>6} {r[args.label_b]['passed']}/{r[args.label_b]['total']:>6}")
    print(f"\nTotal: {args.label_a}={total_a}/{total}  {args.label_b}={total_b}/{total}  — output: {out_dir}")


if __name__ == "__main__":
    main()
