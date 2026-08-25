/** Constants for the eval module. */

/** Max recent batch rows returned by the cross-agent dashboard home (AC-19). */
export const RECENT_BATCHES_LIMIT = 20;

/** Max points carried in a per-agent summary's sparkline (AC-18). */
export const SPARKLINE_LENGTH = 10;

/** A batch still marked 'running' past this age is treated as orphaned (the
 *  server that started it died/restarted mid-run) rather than genuinely
 *  in-flight — otherwise a crash would leave the "Run all evals" button
 *  disabled forever with no way to recover short of a manual DB fix. */
export const EVAL_BATCH_RUNNING_STALE_MS = 30 * 60 * 1000;
