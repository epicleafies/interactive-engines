/**
 * Money Emergence Simulation — reference engine entry point.
 *
 * Build-order status: this is build-order step 2 (the reference engine), which
 * follows step 1 (the assertion-harness skeleton). The engine's behavior-
 * determining core is NOT implemented here yet, by design: a full read of the
 * criteria and spec surfaced four points where two faithful implementations
 * could legally diverge at a fixed seed, and the standing rule is to stop and
 * escalate those for a decisions-register ruling rather than pick an
 * interpretation. Those points are enumerated below; until they are ruled, the
 * engine must not encode a silent choice that would become the de-facto behavior.
 *
 * The harness skeleton is fully usable in the meantime: engine-dependent
 * assertions report `pending`, never a false `pass`.
 *
 * Open governing-document questions blocking the deterministic core (each
 * changes the event stream at a fixed seed):
 *
 *   (A) Score / A(g) windowing. Engine spec §7.2 defines the score "over events
 *       within a rolling window of WINDOW_ROUNDS rounds" but its own
 *       implementation note — and the register entry D-016 formula ("decayed
 *       positive event weight / decayed total event weight") — describe a pure
 *       multiplicative-decay accumulator with no hard cutoff. These are
 *       different algorithms. (WINDOW_ROUNDS is used by the §6.1 refusal-
 *       exclusion memory regardless.)
 *
 *   (B) Seed prior, "visible neighbors". §4.3's "share of i's visible neighbors
 *       whose want is g" does not state whether i counts itself; in small
 *       neighborhoods this changes the prior and hence the score.
 *
 *   (C) Want draw, inverse-CDF category order. §11 pins draw order across agents
 *       but not the category-iteration order within a categorical want draw;
 *       different orders select different goods for the same PRNG value.
 *
 *   (D) Fisher-Yates variant + float->int. §11 says "Fisher-Yates with defined
 *       iteration order" but does not pin the variant (upward vs.
 *       Durstenfeld-downward) or the u->integer mapping.
 */

import type { RunFn } from "./types.ts";

export const ENGINE_BLOCKED_MESSAGE =
  "reference engine not implemented: build-order step 2 is gated on decisions-register " +
  "rulings for the four divergence points (A)-(D) documented in engines/emergence/index.ts";

/**
 * The engine entry point. Throws until the reference core is implemented; see the
 * module header for why it is intentionally not yet implemented.
 */
export const run: RunFn = () => {
  throw new Error(ENGINE_BLOCKED_MESSAGE);
};

export * from "./types.ts";
export * from "./constants.ts";
