/**
 * Ablation-mode predicates (engine spec §1; criteria A1, A2).
 *
 * Ablations are CONFIG inputs — the engine reads them like any other
 * configuration, so they are upstream of the pinned trace, not gated by D-032
 * (the default `none` path is what the PROJECT_SEED trace pins). Each ablation
 * disables exactly one mechanism so a headline result can be shown to depend on
 * it:
 *   - A1 freezes acceptance-tally learning after seeding AND pins every want at
 *     its initial draw (consumption does not redraw). The static-demand market
 *     still runs, so the test can fail in both directions.
 *   - A2:<attribute> disables one attribute's mechanic while leaving its level
 *     displayed, so that level must then have zero measurable effect.
 */

import type { AttributeName, Config } from "./types.ts";

/** Whether the A1 tally-ablation mode is active. */
export function isA1(config: Config): boolean {
  return config.ablation.kind === "A1";
}

/** Whether the A2 mechanic-ablation for `attribute` is active. */
export function isA2(config: Config, attribute: AttributeName): boolean {
  return config.ablation.kind === "A2" && config.ablation.attribute === attribute;
}
