/**
 * Small config lookups shared across the engine. Pure; no draws, no host APIs.
 * These centralize the level -> parameter reads so the mapping table is the only
 * place a level becomes a number (engine spec §2.2: the mapping is the sole
 * tuning surface; two goods at the same level are mechanically identical).
 */

import type { Config, GoodType, Schedule, SizeClass } from "./types.ts";

export function goodById(config: Config, id: number): GoodType {
  const g = config.goods[id];
  if (g === undefined) throw new Error(`unknown good type id ${id}`);
  return g;
}

/** Fake probability for a good, from its recognizability level (high recog = 0). */
export function fakeProbOf(config: Config, type: number): number {
  return config.mapping.fakeProbability[goodById(config, type).attributes.recognizability];
}

/** Durability schedule for a good, from its durability level. */
export function scheduleOf(config: Config, type: number): Schedule {
  return config.mapping.durabilitySchedule[goodById(config, type).attributes.durability];
}

/** Size class for a good, from its divisibility level. */
export function sizeClassOf(config: Config, type: number): SizeClass {
  return config.mapping.sizeClass[goodById(config, type).attributes.divisibility];
}

/** Reach radius for a good, from its portability level. */
export function reachOf(config: Config, type: number): number {
  return config.mapping.reachRadius[goodById(config, type).attributes.portability];
}

/** Want-share weight for a focal good, from its desirability level. */
export function wantShareOf(config: Config, type: number): number {
  return config.mapping.wantShareWeight[goodById(config, type).attributes.desirability];
}
