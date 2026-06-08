/**
 * Ring geometry. Agents sit on a ring of N positions; distance is ring distance
 * (the shorter way around). This is pure integer arithmetic — no PRNG, no
 * platform APIs — and is independent of every open governing-document question.
 */

/** Shortest distance between two ring positions on a ring of `n` positions. */
export function ringDistance(a: number, b: number, n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error(`ringDistance: bad ring size ${n}`);
  const raw = Math.abs(a - b);
  return Math.min(raw, n - raw);
}

/**
 * Mutual reach (criteria B5; engine spec §6.4). A trade is eligible only if the
 * ring distance between the parties is <= the MINIMUM of the two held goods'
 * reach radii — reach holds mutually, so a good can never travel a distance its
 * own radius forbids, even when pulled by a light-good counterparty.
 */
export function mutualReachRadius(reachA: number, reachB: number): number {
  return Math.min(reachA, reachB);
}

export function reachEligible(
  a: number,
  b: number,
  n: number,
  reachA: number,
  reachB: number,
): boolean {
  return ringDistance(a, b, n) <= mutualReachRadius(reachA, reachB);
}

/**
 * The region (equal contiguous arc) a ring position belongs to (scaled mode,
 * §1). `regionCount` must divide `n` (validated at config load), so the arcs are
 * equal. Returns a region index in [0, regionCount).
 */
export function regionOf(position: number, n: number, regionCount: number): number {
  const arc = n / regionCount;
  return Math.floor(position / arc);
}
