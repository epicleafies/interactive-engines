/**
 * Engine milestone self-test.
 *
 * Per-milestone deterministic unit/trace checks on the reference engine's
 * INTERNALS, run alongside the harness self-test. This is distinct from the
 * criteria battery (harness/criteria.ts): the battery is the acceptance
 * instrument and is wired against the engine's public run() at M5; this file
 * pins internal behavior as each milestone lands, so a regression in (say) the
 * seed-prior formula fails loudly the moment it happens.
 *
 * Seeds used here are functional test seeds — plain numbers chosen to exercise
 * setup, not for any outcome they produce (D-010). The PROJECT_SEED pinned trace
 * is added at M5.
 *
 * Run via `npm run engine-selftest`. Any failure throws and exits non-zero.
 */

import { ringDistance } from "../engines/emergence/ring.ts";
import { createState, type EngineStateInternal } from "../engines/emergence/state.ts";
import { runSetup, validateConfig } from "../engines/emergence/setup.ts";
import { smallContrastFixture, FIXTURE_CONSTANTS } from "../engines/emergence/fixtures.ts";
import { NONE, type Config } from "../engines/emergence/types.ts";

let checks = 0;
function check(cond: boolean, label: string): void {
  checks++;
  if (!cond) throw new Error(`ENGINE SELF-TEST FAILED: ${label}`);
}
function throws(fn: () => unknown, label: string): void {
  checks++;
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`ENGINE SELF-TEST FAILED (expected throw): ${label}`);
}

const FUNCTIONAL_SEED = 12345; // arbitrary; exercises setup draws, not chosen for outcome.

// --- M1: config validation ----------------------------------------------
{
  validateConfig(smallContrastFixture()); // the fixture is valid.

  // focal want-share sum over the ceiling is rejected.
  throws(() => {
    const c = smallContrastFixture() as Config;
    const bad: Config = { ...c, constants: { ...FIXTURE_CONSTANTS, FILLER_MIN_SHARE: 0.95 } };
    validateConfig(bad);
  }, "focal want-share over 1 - FILLER_MIN_SHARE must be rejected");

  // SEED_CAP above DOM_THRESHOLD is rejected (seed must never start at dominance).
  throws(() => {
    const c = smallContrastFixture();
    const bad: Config = { ...c, constants: { ...FIXTURE_CONSTANTS, SEED_CAP: 0.9 } };
    validateConfig(bad);
  }, "SEED_CAP > DOM_THRESHOLD must be rejected");

  // homeGoods length mismatch is rejected.
  throws(() => {
    const c = smallContrastFixture();
    const bad: Config = { ...c, homeGoods: [0, 1, 2] };
    validateConfig(bad);
  }, "homeGoods length != ringSize must be rejected");

  // a pinned want equal to the agent's homeGood is rejected.
  throws(() => {
    const c = smallContrastFixture();
    const bad: Config = { ...c, pinnedWants: { 0: 0 } }; // position 0 produces good 0
    validateConfig(bad);
  }, "pinned want equal to homeGood must be rejected");
}

// --- M1: setup runs and the seed prior matches the formula exactly -------
{
  const config = smallContrastFixture();
  const state = createState(config, FUNCTIONAL_SEED);
  runSetup(state);

  // Endowment: every agent holds a fresh homeGood instance (the only entry channel).
  for (const a of state.agents) {
    check(a.held !== null, "every agent is endowed at setup");
    check(a.held!.type === a.homeGood, "endowment is the agent's homeGood under the profession policy");
    check(a.held!.age === 0 && a.held!.acquiredByTrade === false, "endowed instance is fresh and not trade-acquired");
    check(a.want !== a.homeGood, "an agent never wants its own homeGood");
  }

  // Conservation: produced == live == ringSize, all charged to the production channel.
  let produced = 0;
  let live = 0;
  for (let g = 0; g < state.goodCount; g++) {
    produced += state.conservation.produced[g]!;
    live += state.conservation.live[g]!;
  }
  check(produced === config.ringSize && live === config.ringSize, "endowment charges exactly ringSize to production");

  // Independent recomputation of S_i(g) from the assigned wants (criteria A6 prior assertion).
  const Wr = config.constants.WITNESS_RADIUS;
  const cap = config.constants.SEED_CAP;
  for (let pos = 0; pos < config.ringSize; pos++) {
    for (let g = 0; g < state.goodCount; g++) {
      let total = 0;
      let count = 0;
      for (let j = 0; j < config.ringSize; j++) {
        if (j === pos) continue;
        if (ringDistance(pos, j, config.ringSize) <= Wr) {
          total++;
          if (state.agents[j]!.want === g) count++;
        }
      }
      const expected = Math.min(total > 0 ? count / total : 0, cap);
      const got = state.agents[pos]!.prior[g]!;
      check(Math.abs(got - expected) < 1e-12, `seed prior mismatch at agent ${pos}, good ${g}: ${got} vs ${expected}`);
    }
  }

  // The prior is capped: no prior exceeds SEED_CAP, so the chart never opens at dominance.
  for (const a of state.agents) {
    for (const p of a.prior) check(p <= cap + 1e-12, "no seeded prior exceeds SEED_CAP");
  }

  // Score is defined for every agent/good from the first moment (denominator >= K).
  const K = config.constants.SEED_STRENGTH;
  for (const a of state.agents) {
    for (let g = 0; g < state.goodCount; g++) {
      const score = (a.scorePos[g]! + K * a.prior[g]!) / (a.scoreTot[g]! + K);
      check(Number.isFinite(score), "every initial score is a finite number");
    }
  }
}

// --- M1: setup determinism ------------------------------------------------
function setupSnapshot(state: EngineStateInternal): string {
  const agents = state.agents.map((a) => ({
    home: a.homeGood,
    want: a.want === NONE ? "NONE" : a.want,
    held: a.held ? [a.held.type, a.held.isFake ? 1 : 0, a.held.age] : null,
    prior: a.prior.map((x) => x.toFixed(9)),
  }));
  return JSON.stringify({ agents, events: state.events });
}
{
  const a = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(a);
  const b = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(b);
  check(setupSnapshot(a) === setupSnapshot(b), "same {config, seed} produces identical setup");

  const c = createState(smallContrastFixture(), FUNCTIONAL_SEED + 1);
  runSetup(c);
  check(setupSnapshot(a) !== setupSnapshot(c), "a different seed produces a different setup");
}

console.log(`engine self-test OK — ${checks} checks passed (M1 setup).`);
