/**
 * Setup (engine spec §4; RNG tape §11 setup segment).
 *
 * Validates the configuration (rejecting invalid ones at load rather than
 * silently normalizing), then runs the setup tape in its fixed draw order:
 *   1. endowment — the production policy invoked once per agent at round 0, in
 *      ring-position order (this is the only entry channel, so conservation
 *      closes from the first round);
 *   2. wants — drawn in ring-position order from the want distribution, with the
 *      agent's own homeGood excluded and its share mass redistributed across the
 *      filler pool only (never across other focal goods); pinned wants bypass the
 *      draw and consume no randomness;
 *   3. seed prior — a permanent, capped, local want-share prior, computed from
 *      the wants just assigned and consuming no randomness.
 *
 * The seed prior excludes the agent itself (D-022): it models expected
 * acceptance BY OTHERS, so an agent's own want is its state, not an observation
 * of local demand.
 */

import { categorical } from "./rng.ts";
import { ringDistance } from "./ring.ts";
import { produceFor } from "./produce.ts";
import { wantShareOf } from "./lookup.ts";
import type { Config, WantTarget } from "./types.ts";
import { NONE } from "./types.ts";
import type { EngineStateInternal } from "./state.ts";

/** Reject configurations the engine cannot faithfully run. Throws on the first problem. */
export function validateConfig(config: Config): void {
  const n = config.goods.length;
  if (config.ringSize < 1) throw new Error("config: ringSize must be >= 1");
  if (n < 1) throw new Error("config: at least one good type is required");

  // Good ids are the canonical type index: good at array slot i must have id i.
  config.goods.forEach((g, i) => {
    if (g.id !== i) throw new Error(`config: good at index ${i} has id ${g.id}; id must equal index`);
  });
  for (const id of config.focalGoodIds) {
    if (id < 0 || id >= n) throw new Error(`config: focalGoodIds references unknown good ${id}`);
  }

  // homeGoods: required and per-position (the engine does not invent a holdings
  // distribution — a structural fixture or campaign config assigns it explicitly).
  if (!config.homeGoods) throw new Error("config: homeGoods (one good id per ring position) is required");
  if (config.homeGoods.length !== config.ringSize) {
    throw new Error(`config: homeGoods length ${config.homeGoods.length} != ringSize ${config.ringSize}`);
  }
  for (const h of config.homeGoods) {
    if (h < 0 || h >= n) throw new Error(`config: homeGoods references unknown good ${h}`);
  }

  // Config validity floor (R-34): focal want-shares must leave room for fillers.
  let focalSum = 0;
  for (const id of config.focalGoodIds) focalSum += wantShareOf(config, id);
  const ceiling = 1 - config.constants.FILLER_MIN_SHARE;
  if (focalSum > ceiling + 1e-12) {
    throw new Error(
      `config: focal want-share sum ${focalSum} exceeds 1 - FILLER_MIN_SHARE (${ceiling}); ` +
        "configuration is rejected, never silently normalized",
    );
  }

  // Seed headroom precondition (§2.4 validity precondition #2; D-016/§4.3; V-26;
  // D-056): SEED_CAP <= DOM_THRESHOLD - D5_MARGIN, enforced in FULL at load and
  // asserted by G7 — not deferred to D5 grading. D5_MARGIN is a named engine
  // constant whose home D-056 rules and whose value C0 fills under H6; the
  // validator reads it symbolically, whatever C0 sets it to, so the bound is
  // complete now. (Supersedes the partial `< DOM_THRESHOLD` floor, which accepted
  // configs §2.4 deems invalid — e.g. SEED_CAP 0.60 against a 0.15 margin and
  // DOM_THRESHOLD 0.70.)
  const seedCeiling = config.constants.DOM_THRESHOLD - config.constants.D5_MARGIN;
  if (config.constants.SEED_CAP > seedCeiling + 1e-12) {
    throw new Error(
      `config: SEED_CAP ${config.constants.SEED_CAP} exceeds DOM_THRESHOLD - D5_MARGIN (${seedCeiling}); ` +
        "the seeded prior must never start within the D5 headroom of dominance; rejected, never normalized",
    );
  }

  // Dominance sustain bound (D-043/V-05): DOM_SUSTAIN must be >= 1. At 0 the
  // "for DOM_SUSTAIN consecutive rounds" clause is vacuous (sustainCount >= 0 is
  // always true), so a good would be crowned dominant on round 1 regardless of
  // every other clause. The validator imposed no lower bound; this adds it.
  if (config.constants.DOM_SUSTAIN < 1) {
    throw new Error("config: DOM_SUSTAIN must be >= 1 (a value of 0 makes the sustain clause vacuous)");
  }

  // Denomination / range sanity on the constants the setup and round loop rely on.
  const c = config.constants;
  if (c.WINDOW_ROUNDS < 1) throw new Error("config: WINDOW_ROUNDS must be >= 1");
  if (c.ROUND_CAP < 1) throw new Error("config: ROUND_CAP must be >= 1");
  if (!(c.DECAY_FACTOR > 0 && c.DECAY_FACTOR <= 1)) throw new Error("config: DECAY_FACTOR must be in (0, 1]");
  if (config.mode === "scaled") {
    if (c.REGION_COUNT < 1) throw new Error("config: scaled mode needs REGION_COUNT >= 1");
    if (config.ringSize % c.REGION_COUNT !== 0) {
      throw new Error("config: REGION_COUNT must divide ringSize into equal arcs");
    }
  }

  // Pinned wants (F1): valid target and never the agent's own homeGood.
  if (config.pinnedWants) {
    for (const [posStr, want] of Object.entries(config.pinnedWants)) {
      const pos = Number(posStr);
      if (want !== NONE && (want < 0 || want >= n)) throw new Error(`config: pinned want ${want} is not a good id`);
      if (want !== NONE && want === config.homeGoods[pos]) {
        throw new Error(`config: pinned want for position ${pos} equals its homeGood; an agent never wants its own good`);
      }
    }
  }
}

/**
 * The post-exclusion, post-redistribution want distribution for an agent whose
 * homeGood is `homeGood`. Returns probabilities indexed by good type id, or
 * `null` when the support is empty (a degenerate single-good world — the agent
 * gets want = NONE and consumes no draw, satisfying G2's inert-market case).
 */
export function wantDistribution(config: Config, homeGood: number): number[] | null {
  const n = config.goods.length;
  const fillerIds = config.goods.filter((g) => g.isFiller).map((g) => g.id);

  const base = new Array<number>(n).fill(0);
  let focalSum = 0;
  for (const id of config.focalGoodIds) {
    const s = wantShareOf(config, id);
    base[id] = s;
    focalSum += s;
  }
  const remainder = 1 - focalSum;
  if (fillerIds.length > 0) {
    const each = remainder / fillerIds.length;
    for (const fid of fillerIds) base[fid] = each;
  }

  // Exclude the homeGood; redistribute its mass across the filler pool only.
  const mass = base[homeGood]!;
  base[homeGood] = 0;
  const eligibleFillers = fillerIds.filter((fid) => fid !== homeGood);
  if (mass > 0 && eligibleFillers.length > 0) {
    const add = mass / eligibleFillers.length;
    for (const fid of eligibleFillers) base[fid] = base[fid]! + add;
  }

  let sum = 0;
  for (const x of base) sum += x;
  if (sum <= 0) return null;
  return base.map((x) => x / sum);
}

/** Run the setup tape against a freshly created state. Mutates `state` in place. */
export function runSetup(state: EngineStateInternal): void {
  const { config } = state;

  // homeGoods (no draws).
  for (let pos = 0; pos < config.ringSize; pos++) {
    state.agents[pos]!.homeGood = config.homeGoods[pos]!;
  }

  // 1. Endowment, ring-position order (fake draws here).
  for (let pos = 0; pos < config.ringSize; pos++) {
    produceFor(state, state.agents[pos]!, 0);
  }

  // 2. Wants, ring-position order. Pinned wants and empty-support cases draw nothing.
  for (let pos = 0; pos < config.ringSize; pos++) {
    const agent = state.agents[pos]!;
    const pinned: WantTarget | undefined = config.pinnedWants?.[pos];
    if (pinned !== undefined) {
      agent.want = pinned;
      continue;
    }
    const dist = wantDistribution(config, agent.homeGood);
    agent.want = dist === null ? NONE : categorical(state.rng, dist);
  }

  // 3. Seed prior (no draws), computed from the assigned wants, excluding self.
  for (let pos = 0; pos < config.ringSize; pos++) {
    computePrior(state, pos);
  }
}

/** S_i(g) = min( share of visible neighbors (excluding self) whose want is g, SEED_CAP ). */
function computePrior(state: EngineStateInternal, pos: number): void {
  const { config } = state;
  const agent = state.agents[pos]!;
  const radius = config.constants.WITNESS_RADIUS;
  const cap = config.constants.SEED_CAP;

  let total = 0;
  const counts = new Array<number>(state.goodCount).fill(0);
  for (let j = 0; j < config.ringSize; j++) {
    if (j === pos) continue; // exclude self (D-022)
    if (ringDistance(pos, j, config.ringSize) <= radius) {
      total++;
      const w = state.agents[j]!.want;
      if (w !== NONE) counts[w] = counts[w]! + 1;
    }
  }
  for (let g = 0; g < state.goodCount; g++) {
    const share = total > 0 ? counts[g]! / total : 0;
    agent.prior[g] = Math.min(share, cap);
  }
}
