#!/usr/bin/env python3
"""Regression-check the onion-architecture skill against evals/evals.json.

For each eval: runs a with-skill review through `claude -p`, grades the
review against its `expectations` with a second `claude -p` call, and exits
non-zero if the overall pass rate drops below --threshold. This is what lets
the skill-creator eval suite built for this skill be re-run headlessly, by
hand or from CI, instead of only through interactive subagent runs.

Usage:
    python3 run_evals.py                       # run all 10 evals
    python3 run_evals.py --only teams-fixture   # run one eval by name
    python3 run_evals.py --threshold 1.0        # require a perfect run
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[2]
EVALS_JSON = SKILL_DIR / "evals" / "evals.json"
SKILL_MD = SKILL_DIR / "SKILL.md"


def find_project_root() -> Path:
    """Walk up from cwd looking for `.claude/`, mirroring how Claude Code
    itself discovers the project root — `claude -p` must run from there so
    the skill (and its evals/fixtures) resolve as project files."""
    current = Path.cwd()
    for parent in [current, *current.parents]:
        if (parent / ".claude").is_dir():
            return parent
    return current


def run_claude(prompt: str, cwd: Path, model: str | None, timeout: int) -> str:
    cmd = ["claude", "-p", prompt, "--output-format", "json"]
    if model:
        cmd += ["--model", model]
    # Nesting guard: allow `claude -p` inside an existing Claude Code session.
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    proc = subprocess.run(
        cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude -p failed (exit {proc.returncode}): {proc.stderr[-2000:]}")
    data = json.loads(proc.stdout)
    return data.get("result", "")


def review_prompt(eval_item: dict, fixture_dir: Path) -> str:
    return (
        f"Read the skill at {SKILL_MD} first and follow its guidance.\n\n"
        f"{eval_item['prompt']}\n\n"
        f"The module's absolute path is: {fixture_dir}\n"
        "Read every .ts file in that directory before reviewing. "
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


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--threshold", type=float, default=0.9, help="minimum pass rate to succeed (0-1)")
    ap.add_argument("--model", default=None, help="override the model claude -p uses")
    ap.add_argument("--timeout", type=int, default=300, help="per-call timeout in seconds")
    ap.add_argument("--only", default=None, help="run a single eval by its `name`")
    ap.add_argument("--out", default=None, help="output dir (default: evals/ci-runs/<timestamp>)")
    args = ap.parse_args()

    evals = json.loads(EVALS_JSON.read_text())["evals"]
    if args.only:
        evals = [e for e in evals if e["name"] == args.only]
        if not evals:
            sys.exit(f"no eval named {args.only!r} in {EVALS_JSON}")

    project_root = find_project_root()
    out_dir = Path(args.out) if args.out else SKILL_DIR / "evals" / "ci-runs" / time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for ev in evals:
        fixture_dir = (SKILL_DIR / Path(ev["files"][0])).parent
        print(f"[{ev['name']}] reviewing...", file=sys.stderr)
        review = run_claude(review_prompt(ev, fixture_dir), project_root, args.model, args.timeout)
        (out_dir / f"{ev['name']}.review.md").write_text(review)

        print(f"[{ev['name']}] grading...", file=sys.stderr)
        grading_raw = run_claude(grading_prompt(ev, review), project_root, args.model, args.timeout)
        try:
            grading = json.loads(grading_raw)
        except json.JSONDecodeError:
            n = len(ev["expectations"])
            grading = {
                "expectations": [],
                "summary": {"passed": 0, "failed": n, "total": n, "pass_rate": 0.0},
                "parse_error": grading_raw[:500],
            }
        (out_dir / f"{ev['name']}.grading.json").write_text(json.dumps(grading, indent=2))
        results.append({"name": ev["name"], **grading["summary"]})

    total_passed = sum(r["passed"] for r in results)
    total = sum(r["total"] for r in results)
    pass_rate = (total_passed / total) if total else 0.0

    summary = {"results": results, "total_passed": total_passed, "total": total, "pass_rate": pass_rate}
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    print(f"\n{'eval':30s} {'pass':>6s}")
    for r in results:
        print(f"{r['name']:30s} {r['passed']}/{r['total']}")
    print(f"\nOverall: {total_passed}/{total} ({pass_rate:.0%}) — output: {out_dir}")

    if pass_rate < args.threshold:
        print(f"FAIL: pass rate {pass_rate:.0%} below threshold {args.threshold:.0%}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
