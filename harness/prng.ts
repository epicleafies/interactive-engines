/**
 * Seeded pseudo-random number generator — the single randomness source for the
 * whole project (engine and harness alike). No `Math.random` is used anywhere;
 * every run's randomness flows from an explicit seed so that any run can be
 * replayed bit-for-bit from `{seed, config}` alone.
 *
 * Algorithm: mulberry32. A 32-bit state PRNG built only from operations whose
 * results are identical under any IEEE-754 / JS engine (V8 and Hermes): 32-bit
 * integer addition, XOR, unsigned shifts, and `Math.imul`. No transcendental
 * math, no platform APIs. This is what makes cross-platform bit-identical
 * replay (criteria H4) achievable: the same seed yields the same draw sequence
 * on web and React Native.
 *
 * This module defines the *primitive* stream. The exact higher-level draw
 * arithmetic the engine layers on top of it (how a float becomes an integer
 * index, the iteration order of a categorical draw, the Fisher–Yates variant)
 * is part of the engine's RNG tape and is specified there, not here.
 */

/** A pure, replayable random stream. State is internal and advances per draw. */
export interface Rng {
  /** Next float in the half-open interval [0, 1). */
  nextFloat(): number;
  /**
   * Next integer in [0, n). Defined for n >= 1. The construction is fixed as
   * `Math.floor(nextFloat() * n)`; because nextFloat() < 1 the result is always
   * in [0, n-1]. Callers that need a bounded integer MUST go through this method
   * so the float→int mapping stays identical across implementations.
   */
  nextInt(n: number): number;
  /** Current raw 32-bit state, for snapshotting/inspection in the harness. */
  state(): number;
}

/**
 * Construct a mulberry32 stream from a 32-bit seed. The seed is coerced to an
 * unsigned 32-bit integer; callers pass whole numbers (e.g. PROJECT_SEED or a
 * documented functional seed).
 */
export function makeRng(seed: number): Rng {
  // `s` is held as a JS number but every update keeps it within uint32 via the
  // `| 0` / `>>> 0` discipline below, so behavior is engine-independent.
  let s = seed >>> 0;

  function nextFloat(): number {
    // mulberry32 core.
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(n: number): number {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`nextInt requires an integer n >= 1, got ${n}`);
    }
    return Math.floor(nextFloat() * n);
  }

  return {
    nextFloat,
    nextInt,
    state: () => s >>> 0,
  };
}
