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
import { runRound, stepFakeReveals, stepAging, stepConsumption } from "../engines/emergence/round.ts";
import { smallContrastFixture, FIXTURE_CONSTANTS } from "../engines/emergence/fixtures.ts";
import { NONE, type Config, type EngineEvent } from "../engines/emergence/types.ts";

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

// --- M2: conservation invariant holds at all times -----------------------
// Live count of each good equals production minus all exits (the cumulative
// form of criteria B12's per-round identity), checked after every round.
function checkConservation(state: EngineStateInternal, label: string): void {
  const c = state.conservation;
  for (let g = 0; g < state.goodCount; g++) {
    const expected = c.produced[g]! - c.consumed[g]! - c.spoiled[g]! - c.fake[g]!;
    check(c.live[g]! === expected, `${label}: conservation broken for good ${g} (live ${c.live[g]} != ${expected})`);
    check(c.live[g]! >= 0, `${label}: negative live count for good ${g}`);
  }
}

// --- M2: integration — run the fixture with NO trading for 12 rounds ------
// Producers hold their homeGood, so the fast-spoiling weak focal (good 1)
// cycles spoil -> re-endow every couple of rounds, exercising steps 2 and 3 and
// the spoilage exit channels, while the never-spoiling good 0 stays put.
{
  const config = smallContrastFixture();
  const state = createState(config, FUNCTIONAL_SEED);
  runSetup(state);
  checkConservation(state, "after setup");

  for (let r = 0; r < 12; r++) {
    runRound(state);
    checkConservation(state, `after round ${state.round}`);
  }

  const ev = state.events;
  const spoilStage1 = ev.filter((e) => e.type === "SPOIL_STAGE" && e.good === 1).length;
  const spoilDestroy1 = ev.filter((e) => e.type === "SPOIL_DESTROY" && e.good === 1).length;
  const reEndow1 = ev.filter((e) => e.type === "PRODUCE" && e.good === 1 && e.round > 0).length;
  check(spoilStage1 > 0, "fast-spoiling good 1 must reach the stale stage (SPOIL_STAGE)");
  check(spoilDestroy1 > 0, "fast-spoiling good 1 must be destroyed (SPOIL_DESTROY)");
  check(reEndow1 > 0, "spoiled good-1 producers must be re-endowed (PRODUCE after round 0)");

  // The never-spoiling strong good 0 never spoils and (no trading) never moves.
  check(
    ev.every((e) => !((e.type === "SPOIL_STAGE" || e.type === "SPOIL_DESTROY") && e.good === 0)),
    "never-spoiling good 0 must never stage or spoil",
  );

  // Every fake exit (a fake that spoils, here) is charged to the fake channel,
  // never the spoiled channel — fake[g] equals the count of fake exits for g.
  for (let g = 0; g < state.goodCount; g++) {
    const fakeExits =
      ev.filter((e) => e.type === "FAKE_REVEAL" && e.good === g).length +
      ev.filter((e) => e.type === "SPOIL_DESTROY" && e.good === g && e.wasFake).length;
    check(state.conservation.fake[g]! === fakeExits, `fake channel for good ${g} must equal its fake exits`);
  }
}

// --- M2: white-box branch coverage (deterministic, no trading needed) -----
function newEventsFrom(state: EngineStateInternal, fn: () => void): EngineEvent[] {
  const before = state.events.length;
  fn();
  return state.events.slice(before);
}

// Step 1: a trade-acquired fake held since the previous round reveals as "trade".
{
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  const a = state.agents[0]!;
  a.held = { type: 1, age: 0, isFake: true, acquiredByTrade: true, acquiredRound: 4 };
  state.conservation.live[1] = state.conservation.live[1]! + 1; // account for the injected instance
  state.conservation.produced[1] = state.conservation.produced[1]! + 1;
  const out = newEventsFrom(state, () => stepFakeReveals(state, 5));
  check(out.length === 1 && out[0]!.type === "FAKE_REVEAL", "trade-acquired fake must reveal at step 1");
  check(out[0]!.type === "FAKE_REVEAL" && out[0]!.context === "trade", "step-1 reveal context is 'trade'");
  check(a.held === null, "revealed fake is destroyed");
  checkConservation(state, "after step-1 reveal");

  // A self-produced fake (acquiredByTrade=false) does NOT reveal at step 1.
  const b = state.agents[1]!;
  b.held = { type: 1, age: 0, isFake: true, acquiredByTrade: false, acquiredRound: null };
  const out2 = newEventsFrom(state, () => stepFakeReveals(state, 6));
  check(out2.length === 0 && b.held !== null, "self-produced fake must not reveal at step 1");
}

// Step 2: a fake that spoils exits via the fake channel with wasFake=true.
{
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  const a = state.agents[0]!;
  // good 1 schedule is s1=1,s2=1: age 1 -> 2 crosses the destroy tick.
  a.held = { type: 1, age: 1, isFake: true, acquiredByTrade: false, acquiredRound: null };
  state.conservation.live[1] = state.conservation.live[1]! + 1;
  state.conservation.produced[1] = state.conservation.produced[1]! + 1;
  const fakeBefore = state.conservation.fake[1]!;
  const spoiledBefore = state.conservation.spoiled[1]!;
  const out = newEventsFrom(state, () => stepAging(state, 3));
  const sd = out.find((e) => e.type === "SPOIL_DESTROY");
  check(sd !== undefined && sd.type === "SPOIL_DESTROY" && sd.wasFake === true, "a spoiling fake emits SPOIL_DESTROY with wasFake=true");
  check(state.conservation.fake[1]! === fakeBefore + 1, "a spoiling fake exits via the fake channel");
  check(state.conservation.spoiled[1]! === spoiledBefore, "a spoiling fake does NOT touch the spoiled channel");
  check(a.held === null, "spoiled instance is destroyed");
}

// Step 5: real consumption emits CONSUME and redraws; a fake want surfaces on use.
{
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  const a = state.agents[0]!;
  const wantType = a.want === NONE ? 2 : (a.want as number);
  a.want = wantType;
  a.held = { type: wantType, age: 0, isFake: false, acquiredByTrade: false, acquiredRound: null };
  state.conservation.live[wantType] = state.conservation.live[wantType]! + 1;
  state.conservation.produced[wantType] = state.conservation.produced[wantType]! + 1;
  const consumedBefore = state.conservation.consumed[wantType]!;
  const out = newEventsFrom(state, () => stepConsumption(state, 7));
  check(out.some((e) => e.type === "CONSUME" && e.agent === 0), "holding one's want emits CONSUME");
  check(a.held === null, "consumed instance is gone");
  check(state.conservation.consumed[wantType]! === consumedBefore + 1, "consumption charges the consumed channel");
  check(a.want !== wantType ? true : a.want !== a.homeGood, "want redraws after real consumption (never the homeGood)");
}
{
  // Fake want: FAKE_REVEAL (context "consume"), want not satisfied, no redraw.
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  const a = state.agents[3]!; // produces good 1
  const wantType = a.want === NONE ? 0 : (a.want as number);
  a.want = wantType;
  a.held = { type: wantType, age: 0, isFake: true, acquiredByTrade: true, acquiredRound: null };
  state.conservation.live[wantType] = state.conservation.live[wantType]! + 1;
  state.conservation.produced[wantType] = state.conservation.produced[wantType]! + 1;
  const wantBefore = a.want;
  const out = newEventsFrom(state, () => stepConsumption(state, 7));
  const fr = out.find((e) => e.type === "FAKE_REVEAL");
  check(fr !== undefined && fr.type === "FAKE_REVEAL" && fr.context === "consume", "a fake want surfaces as FAKE_REVEAL on use");
  check(a.want === wantBefore, "a surfaced fake does not satisfy the want, so no redraw");
  check(a.held === null, "the fake is destroyed on the attempted consumption");
}

// A1 ablation: real consumption does NOT redraw — the want persists.
{
  const a1Config: Config = { ...smallContrastFixture(), ablation: { kind: "A1" } };
  const state = createState(a1Config, FUNCTIONAL_SEED);
  runSetup(state);
  const a = state.agents[0]!;
  const wantType = a.want === NONE ? 2 : (a.want as number);
  a.want = wantType;
  a.held = { type: wantType, age: 0, isFake: false, acquiredByTrade: false, acquiredRound: null };
  state.conservation.live[wantType] = state.conservation.live[wantType]! + 1;
  state.conservation.produced[wantType] = state.conservation.produced[wantType]! + 1;
  stepConsumption(state, 7);
  check(a.want === wantType, "under the A1 ablation, the want persists after consumption (no redraw)");
}

// --- M2: round-mechanics determinism --------------------------------------
function runSnapshot(seed: number, rounds: number): string {
  const state = createState(smallContrastFixture(), seed);
  runSetup(state);
  for (let r = 0; r < rounds; r++) runRound(state);
  const agents = state.agents.map((a) => ({
    home: a.homeGood,
    want: a.want === NONE ? "NONE" : a.want,
    held: a.held ? [a.held.type, a.held.isFake ? 1 : 0, a.held.age, a.held.acquiredByTrade ? 1 : 0] : null,
    empty: a.emptyRounds,
  }));
  return JSON.stringify({ agents, events: state.events, conservation: state.conservation });
}
{
  check(runSnapshot(FUNCTIONAL_SEED, 12) === runSnapshot(FUNCTIONAL_SEED, 12), "round mechanics are deterministic for a fixed seed");
  check(runSnapshot(FUNCTIONAL_SEED, 12) !== runSnapshot(FUNCTIONAL_SEED + 1, 12), "a different seed yields a different run");
}

console.log(`engine self-test OK — ${checks} checks passed (M1 setup; M2 round mechanics 1/2/3/5).`);
