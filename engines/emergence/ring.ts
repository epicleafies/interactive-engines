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

/** Whether two positions are within `radius` ring positions of each other. */
export function withinRadius(a: number, b: number, n: number, radius: number): boolean {
  return ringDistance(a, b, n) <= radius;
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
