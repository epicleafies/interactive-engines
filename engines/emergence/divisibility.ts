/**
 * Divisibility size-compatibility (criteria B4; engine spec §6.2).
 *
 * Whether two goods can match value in a trade is a pure, deterministic function
 * of their two size classes — same classes, same verdict, every time, no
 * re-rolls. The rule: fine matches anything; coarse matches coarse (both flex in
 * chunks); a whole lump clears only against fine, because exact change against an
 * indivisible unit requires the other side to divide arbitrarily.
 *
 * Compatibility table (rows = one side, cols = other side; symmetric):
 *            fine   coarse  whole
 *   fine     pass   pass    pass
 *   coarse   pass   pass    FAIL
 *   whole    pass   FAIL    FAIL
 *
 * This function is independent of every open governing-document question.
 */

import type { SizeClass } from "./types.ts";

/**
 * True iff the two size classes are trade-compatible. Derivation that reproduces
 * the table exactly: a pairing fails iff neither side is `fine` and at least one
 * side is `whole`. Equivalently, it passes iff some side is `fine`, or both are
 * `coarse`.
 */
export function sizeCompatible(a: SizeClass, b: SizeClass): boolean {
  if (a === "fine" || b === "fine") return true;
  if (a === "coarse" && b === "coarse") return true;
  // remaining cases involve a `whole` against a non-fine: fail.
  return false;
}
