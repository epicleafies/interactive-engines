/**
 * Batch runner.
 *
 * Every behavioral claim is evaluated over a batch of seeded runs, not a single
 * run (criteria H2; default batch size 50). This module turns a single-run
 * function into a batch and derives the batch's seeds deterministically, so the
 * batch itself is replayable: the same base seed yields the same set of run
 * seeds, and therefore the same batch, on any machine.
 *
 * It is generic over the run result type so it is usable now (over any
 * replayable function) and unchanged once the reference engine supplies a
 * concrete `run(config, seed)`.
 */

import { makeRng } from "./prng.ts";

/** The harness default batch size (criteria H2). */
export const DEFAULT_BATCH_SIZE = 50;

/**
 * Derive `count` distinct run seeds from a base seed. Seeds are full unsigned
 * 32-bit integers drawn from a mulberry32 stream seeded by `baseSeed`; if a draw
 * collides with one already chosen it is skipped, so the returned seeds are
 * distinct and the derivation is fully determined by `baseSeed`.
 *
 * Deriving the batch from a single base seed (e.g. PROJECT_SEED) keeps the whole
 * batch pinned and replayable rather than depending on an ad-hoc seed list.
 */
export function deriveSeeds(baseSeed: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`deriveSeeds: count must be an integer >= 1, got ${count}`);
  }
  const rng = makeRng(baseSeed);
  const seen = new Set<number>();
  const seeds: number[] = [];
  // Bound iterations so a degenerate stream can never loop forever.
  const maxDraws = count * 1000;
  let draws = 0;
  while (seeds.length < count && draws < maxDraws) {
    draws++;
    const s = Math.floor(rng.nextFloat() * 0x100000000) >>> 0;
    if (seen.has(s)) continue;
    seen.add(s);
    seeds.push(s);
  }
  if (seeds.length < count) {
    throw new Error(
      `deriveSeeds: could not derive ${count} distinct seeds from base ${baseSeed}`,
    );
  }
  return seeds;
}

/** Run `run` once per seed, returning results in seed order. */
export function runBatch<T>(seeds: readonly number[], run: (seed: number) => T): T[] {
  return seeds.map((s) => run(s));
}
