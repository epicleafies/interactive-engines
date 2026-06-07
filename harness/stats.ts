/**
 * Distributional statistics for the acceptance harness.
 *
 * Behavioral claims in this project are evaluated over a *batch* of seeded runs,
 * never a single run (a single run is an anecdote — criteria H2). A criterion
 * "passes" when its stated condition holds at the stated rate across the batch.
 * These helpers compute the summaries the harness reports: central tendency,
 * spread, quantiles, and — the load-bearing one — the share of runs in a batch
 * for which a per-run condition held.
 *
 * Pure functions, no randomness, no platform APIs.
 */

export interface Summary {
  n: number;
  mean: number;
  /** Population standard deviation. */
  stddev: number;
  min: number;
  max: number;
  /** 5th, 50th (median), 95th percentiles. */
  p05: number;
  p50: number;
  p95: number;
}

/** Summarize a sample of numbers. Throws on an empty sample (no honest summary). */
export function summarize(xs: readonly number[]): Summary {
  if (xs.length === 0) {
    throw new Error("summarize: empty sample has no defined summary");
  }
  const n = xs.length;
  let sum = 0;
  for (const x of xs) sum += x;
  const mean = sum / n;
  let sq = 0;
  for (const x of xs) sq += (x - mean) * (x - mean);
  const stddev = Math.sqrt(sq / n);
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    n,
    mean,
    stddev,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    p05: quantile(sorted, 0.05),
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
  };
}

/**
 * Linear-interpolated quantile of an already-sorted ascending sample.
 * q in [0, 1]. Used for spread reporting, not for any PASS/FAIL gate.
 */
export function quantile(sortedAsc: readonly number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) throw new Error("quantile: empty sample");
  if (n === 1) return sortedAsc[0]!;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac;
}

export interface RateResult {
  /** Number of batch items for which the per-run condition held. */
  hits: number;
  /** Batch size. */
  total: number;
  /** hits / total, in [0, 1]. */
  rate: number;
}

/**
 * Share of a batch for which a boolean outcome was true. This is the quantity a
 * C-series legibility check, a convergence rate, or a non-convergence ceiling is
 * graded on: "the condition holds in >= X% of runs".
 */
export function passRate(outcomes: readonly boolean[]): RateResult {
  const total = outcomes.length;
  if (total === 0) throw new Error("passRate: empty batch");
  let hits = 0;
  for (const ok of outcomes) if (ok) hits++;
  return { hits, total, rate: hits / total };
}
