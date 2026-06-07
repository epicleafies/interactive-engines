/**
 * Durability staging (criteria B2; engine spec §6.3).
 *
 * An instance's age determines its condition stage under its good's schedule:
 *   - fresh     iff age < s1
 *   - stale     iff s1 <= age < s1 + s2
 *   - destroyed at the tick reaching s1 + s2
 * A "never spoils" level ages without ever transitioning out of fresh.
 *
 * Age starts at 0 on creation and ticks in the aging step; an instance created
 * in round n first ticks in round n+1. This function classifies a given age; it
 * is pure and independent of every open governing-document question.
 */

import type { Schedule } from "./types.ts";

export type Stage = "fresh" | "stale" | "destroyed";

export function stageOf(age: number, schedule: Schedule): Stage {
  if (age < 0) throw new Error(`stageOf: negative age ${age}`);
  if (schedule.neverSpoils) return "fresh";
  if (age < schedule.s1) return "fresh";
  if (age < schedule.s1 + schedule.s2) return "stale";
  return "destroyed";
}
