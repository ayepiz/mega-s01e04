// Contract for the run-log reader (plan.md § 1). Section 2 builds against this file only:
// keep it small and stable. Implementation: `src/digest/reader.ts`
// (`export const readNight: ReadNight`).

/** Status of one run, as written in the log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of `runs/<night>.jsonl`, after parsing. Any line that doesn't match is a bad line. */
export type LogLine = {
  /** ISO 8601 time with its offset, e.g. `2026-10-29T01:30:00+01:00`. */
  at: string;
  /** Job name, e.g. `lane/sync`. */
  job: string;
  status: RunStatus;
  /** `null` when the job has no owner. */
  owner: string | null;
  /** Present on some `retry` and `fail` lines. */
  error?: string;
};

/**
 * One job's summary for a night. Lines are taken in file order (the log is append-only);
 * "first" and "last" mean first and last line in the file, never a re-sort by time.
 */
export type DigestRow = {
  job: string;
  /** Owner on the job's last line. `null` is kept; views show it as `—`. */
  owner: string | null;
  /** Number of valid lines for this job. */
  runs: number;
  /** Number of those lines with status `retry`. */
  retries: number;
  /** Status of the job's last line. */
  lastStatus: RunStatus;
  /**
   * `error` of the last line for this job that carried one, else `null`.
   * Can be non-null when `lastStatus` is `ok` (the job recovered after a retry).
   */
  lastError: string | null;
  /** `at` of the job's first line, exactly as in the log (offset kept, never converted to UTC). */
  firstAt: string;
  /** `at` of the job's last line, exactly as in the log (offset kept, never converted to UTC). */
  lastAt: string;
};

/** A night's digest. The page and the JSON both render this value as-is. */
export type DigestNight = {
  /** The night asked for, `YYYY-MM-DD`. */
  night: string;
  /**
   * One row per job, sorted by `job` ascending (plain string compare). The reader sorts,
   * so the page and the JSON can never disagree on order.
   */
  rows: DigestRow[];
  /**
   * Lines that are not valid JSON or don't match `LogLine`. Counted, never thrown.
   * Blank lines (e.g. a trailing newline) are skipped, not counted.
   */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl` into a `DigestNight`.
 *
 * - `null` when the file does not exist, or when `night` is not `YYYY-MM-DD`
 *   (so a route can pass the URL param straight in and answer 404 on `null`).
 * - An empty file gives `{ night, rows: [], badLines: 0 }`.
 * - Never throws on bad lines; they are counted in `badLines`.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
