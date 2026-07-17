/**
 * Context roots to discover Markdown docs beneath, at any depth. Server-
 * configured, with these three as the default set (AC-1).
 */
export const CONTEXT_ROOTS = ['specs', 'docs', 'insights'] as const;
export type ContextRootName = (typeof CONTEXT_ROOTS)[number];

/** Only `.md` files are discovered/attachable. Re-checked against the
 *  REALPATH'd target, never the lexical name (server/INSIGHTS.md:41). */
export const CONTEXT_ALLOWED_EXTENSIONS = ['.md'] as const;

/**
 * Per-document read bound — a CRASH GUARD ONLY, never a token budget.
 *
 * This is deliberately NOT `intent/constants.ts`'s `PLAN_SPEC_MAX_BYTES`
 * (16 KB), which silently caps how much of a doc reaches the model. There is
 * no token budget here: a document under this bound is read WHOLE and reaches
 * the model in full; a document over it is refused before any bytes are
 * buffered (AC-29) — the run fails naming the document + its size rather than
 * silently truncating. See spec §Non-functional › Security and
 * `server/INSIGHTS.md:41` for why the two limits must never collapse into one.
 */
export const CONTEXT_MAX_DOC_BYTES = 5 * 1024 * 1024;

/**
 * AC-18 pre-flight overflow check (T4 of `docs/plans/2026-07-17-project-context.md`).
 * Small model→context-window map, keyed by the model ids the agents actually
 * run — NOT an exhaustive registry of every model's real window. Values are
 * best-effort published figures; `gpt-3.5-turbo`'s is deliberately the
 * smallest entry so a hermetic test can exceed `window * OVERFLOW_MARGIN`
 * without allocating hundreds of KB of fixture text.
 *
 * An unknown model id is NOT an error — the run-executor SKIPS the overflow
 * check entirely rather than guess, because a false-positive failure (blocking
 * a run that would have fit) is worse than a missed edge case (AC-13 already
 * frames the token estimate itself as inexact, so a hard block on an unmapped
 * model would be doubly speculative).
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-3.5-turbo': 16_385,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-7-sonnet-20250219': 200_000,
  'deepseek/deepseek-v4-flash': 64_000,
};

/**
 * Only fail the pre-flight overflow check when the ESTIMATED prompt exceeds
 * `window * OVERFLOW_MARGIN` — never an exact `estimate >= window` comparison.
 * The estimate comes from `Tokenizer.count` (`cl100k_base` or its
 * chars/4 fallback), which is NOT the encoding the target model actually
 * uses (AC-13) — margin absorbs that inexactness toward a false NEGATIVE
 * (occasionally missing a real overflow) rather than a false POSITIVE
 * (failing a run that would actually have fit).
 */
export const OVERFLOW_MARGIN = 0.9;

/**
 * Cap on how much text reaches the REAL `cl100k_base` BPE encoder in one
 * `Tokenizer.count` call (architecture-review W1 fix, `docs/plans/2026-07-17-project-context.md`
 * T4). This is a bound on the COUNTING work only — it never truncates what's
 * sent to the model (AC-18's "no truncation" guarantee is about the prompt,
 * not this estimate).
 *
 * Merge-based BPE is NOT linear on adversarial input: a long run of one
 * repeated character (a legal `.md` commit — still well under
 * `CONTEXT_MAX_DOC_BYTES`) is close to worst-case for the algorithm. Measured
 * directly against `js-tiktoken`'s `cl100k_base`: 1,000 'x' characters ≈
 * 126 ms, 2,000 ≈ 452 ms, 4,000 ≈ 1.6 s, 8,000 ≈ 6.7 s — worse than
 * quadratic, and the project-context text this feeds is read from a repo
 * clone any PR author can influence. Text beyond this limit falls back to the
 * O(n) chars/4 heuristic (`approxTokens`) for the remainder — see
 * `estimateTokensBounded` in `helpers.ts`.
 */
export const TOKENIZER_SAFE_CHAR_LIMIT = 2_000;
