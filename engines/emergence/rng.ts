/**
 * The engine's draw helpers — the RNG tape (engine spec §11; pinnings per
 * register entry D-022).
 *
 * The engine consumes a single mulberry32 stream (harness/prng.ts) in the draw
 * order the spec fixes, and turns each 32-bit draw into a decision through the
 * three constructions below. These constructions are part of the spec's tape:
 * cross-platform bit-identical replay (criteria H4) and the independent-referee
 * reproduction (A9) both require the exact arithmetic to be fixed here, not left
 * to an implementation's discretion. All of it is platform-pure: only the
 * floating-point and integer operations the engine is permitted to use.
 *
 * D-022 pinnings:
 *   - u in [0,1) is `Rng.nextFloat()` = u32 / 2^32.
 *   - Bernoulli (e.g. "is this instance fake?"): true iff u < f.
 *   - Categorical (e.g. "which good does this agent want?"): iterate the
 *     options in ascending registered type-index order, accumulating
 *     probability; select the first option whose cumulative probability
 *     exceeds u. Index-order iteration is label-permutation-equivariant, so the
 *     relabel audit (A8) survives.
 *   - Shuffle (acting order): Durstenfeld (downward) Fisher-Yates over the
 *     array initialized to ascending indices — for i = n-1 down to 1,
 *     j = floor(u*(i+1)), swap a[i] and a[j]; exactly n-1 draws, one per step,
 *     no rejection sampling.
 */

import type { Rng } from "../../harness/prng.ts";

/**
 * A single Bernoulli trial: returns true with probability `f`. Pins the
 * convention `isFake iff u < f`, so f=0 never fires (u >= 0) and f=1 always
 * fires (u < 1). Consumes exactly one draw.
 */
export function bernoulli(rng: Rng, f: number): boolean {
  return rng.nextFloat() < f;
}

/**
 * Sample an index from a categorical distribution. `weights[i]` is the
 * probability of index i; the array is indexed in ascending registered
 * type-index order and is expected to sum to 1 (the post-exclusion,
 * post-redistribution want distribution). Selects the first index whose
 * cumulative probability exceeds the single draw u. Consumes exactly one draw.
 *
 * If floating-point drift in the cumulative sum leaves u un-exceeded at the end
 * (only possible when the sum is marginally below 1), the last positive-weight
 * index is returned — the same index the exact distribution would select, never
 * an out-of-range or zero-probability one.
 */
export function categorical(rng: Rng, weights: readonly number[]): number {
  if (weights.length === 0) throw new Error("categorical: empty distribution");
  const u = rng.nextFloat();
  let cumulative = 0;
  let lastPositive = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (w > 0) lastPositive = i;
    cumulative += w;
    if (u < cumulative) return i;
  }
  if (lastPositive === -1) throw new Error("categorical: all-zero distribution");
  return lastPositive;
}

/**
 * Produce a shuffled permutation of [0, 1, ..., n-1] as the round's acting
 * order. Durstenfeld downward, initialized to ascending indices; consumes
 * exactly n-1 draws (none when n <= 1). Returns a fresh array; does not mutate
 * caller state.
 */
export function shuffleOrder(rng: Rng, n: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new Error(`shuffleOrder: bad n ${n}`);
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(i);
  for (let i = n - 1; i >= 1; i--) {
    const j = rng.nextInt(i + 1); // floor(u * (i+1))
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
