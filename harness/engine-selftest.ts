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

import { run } from "../engines/emergence/index.ts";
import { ringDistance } from "../engines/emergence/ring.ts";
import { createState, type EngineStateInternal } from "../engines/emergence/state.ts";
import { runSetup, validateConfig } from "../engines/emergence/setup.ts";
import {
  runRound,
  stepFakeReveals,
  stepAging,
  stepProduction,
  stepConsumption,
  stepEndOfRound,
} from "../engines/emergence/round.ts";
import { selectPartner, evaluateAcceptance, stepTrading } from "../engines/emergence/decide.ts";
import { tallyUpdate } from "../engines/emergence/score.ts";
import { stepStatistics, computeA, windowedTrades, writeBuckets } from "../engines/emergence/statistic.ts";
import type { InstanceState, GoodStatState } from "../engines/emergence/state.ts";
import { smallContrastFixture, tradingPairFixture, scaledFixture, singleGoodPerishableFixture, pinningFixture, FIXTURE_CONSTANTS } from "../engines/emergence/fixtures.ts";
import { unfilledConstants } from "../engines/emergence/constants.ts";
import { runCampaign, type CampaignSpec, type TbdDeclaration } from "./campaign.ts";
import { NONE, NO_EVIDENCE, type Config, type EngineEvent } from "../engines/emergence/types.ts";

/** Directly set a good's rolling bucket for a round (white-box statistics tests). */
function setBkt(gs: GoodStatState, round: number, window: number, pos: number, tot: number, trade: number): void {
  const i = round % window;
  gs.posBucket[i] = pos;
  gs.totBucket[i] = tot;
  gs.tradeBucket[i] = trade;
  gs.bucketRound[i] = round;
}

/** Drive only the M2 steps (1,2,3,5) — no trading, no tally — for isolation tests. */
function noTradeRound(state: EngineStateInternal): void {
  state.round += 1;
  const round = state.round;
  stepFakeReveals(state, round);
  stepAging(state, round);
  stepProduction(state, round);
  stepConsumption(state, round);
  stepEndOfRound(state);
}

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
    noTradeRound(state);
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

// --- M3: a frozen market is handled gracefully ----------------------------
// The smallContrast fixture is untuned and freezes (reach barriers, flat
// priors): agents propose but nothing clears. The engine must run it to the cap
// without error, keep conservation closed, and keep every score finite — the
// liveness question (B1/B13) is measured, not assumed away.
{
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  for (let r = 0; r < 20; r++) {
    runRound(state);
    checkConservation(state, `frozen-market round ${state.round}`);
  }
  const refusals = state.events.filter((e) => e.type === "REFUSAL").length;
  check(refusals > 0, "the frozen market still PROPOSES (refusals occur) — it is not silently inert");
  const K = state.config.constants.SEED_STRENGTH;
  for (const a of state.agents)
    for (let g = 0; g < state.goodCount; g++)
      check(Number.isFinite((a.scorePos[g]! + K * a.prior[g]!) / (a.scoreTot[g]! + K)), "frozen-market scores stay finite");
}

// --- M3: trading integration (full rounds) --------------------------------
{
  const config = tradingPairFixture();
  const state = createState(config, FUNCTIONAL_SEED);
  runSetup(state);
  for (let r = 0; r < 40; r++) {
    runRound(state);
    checkConservation(state, `after full round ${state.round}`);
  }
  const ev = state.events;

  const trades = ev.filter((e) => e.type === "TRADE");
  const refusals = ev.filter((e) => e.type === "REFUSAL");
  const traces = ev.filter((e) => e.type === "DECISION_TRACE");
  check(trades.length > 0, "trading must actually occur over a full run");

  // Trade preserves instances: a TRADE is not an entry or an exit, so conservation
  // (already checked per round) stays closed even as goods move hands.

  // Every acceptance evaluation emits exactly one DECISION_TRACE (D-023b).
  check(traces.length === trades.length + refusals.length, "one DECISION_TRACE per acceptance evaluation");
  for (const t of traces) {
    if (t.type !== "DECISION_TRACE") continue;
    const wasTrade = trades.some((x) => x.round === t.round && x.type === "TRADE" && x.partner === t.agent);
    check(
      (t.verdict === "accept") === wasTrade || refusals.some((x) => x.round === t.round && x.type === "REFUSAL" && x.partner === t.agent),
      "a DECISION_TRACE verdict matches its outcome event",
    );
  }

  // One completed trade per agent per round, in any role.
  const byRound = new Map<number, number[]>();
  for (const e of trades) {
    if (e.type !== "TRADE") continue;
    const list = byRound.get(e.round) ?? [];
    list.push(e.proposer, e.partner);
    byRound.set(e.round, list);
  }
  for (const [r, participants] of byRound) {
    check(new Set(participants).size === participants.length, `no agent trades twice in round ${r}`);
  }

  // FIRST_BRIDGE_ACCEPT fires at most once; when it does, it names >=1 qualifying
  // party and coincides with a completed trade that round (D-028).
  const fba = ev.filter((e) => e.type === "FIRST_BRIDGE_ACCEPT");
  check(fba.length <= 1, "FIRST_BRIDGE_ACCEPT fires at most once per run");
  if (fba.length === 1 && fba[0]!.type === "FIRST_BRIDGE_ACCEPT") {
    const e = fba[0]!;
    check(e.qualifiers.length >= 1, "FIRST_BRIDGE_ACCEPT names at least one qualifying party");
    check(trades.some((x) => x.round === e.round), "FIRST_BRIDGE_ACCEPT coincides with a completed trade");
  }

  // Every score stays a defined finite number.
  const K = config.constants.SEED_STRENGTH;
  for (const a of state.agents) {
    for (let g = 0; g < state.goodCount; g++) {
      const s = (a.scorePos[g]! + K * a.prior[g]!) / (a.scoreTot[g]! + K);
      check(Number.isFinite(s), "scores remain finite across a full run");
    }
  }
}

// --- M3: trading determinism ----------------------------------------------
function fullRunSnapshot(seed: number, rounds: number): string {
  const state = createState(tradingPairFixture(), seed);
  runSetup(state);
  for (let r = 0; r < rounds; r++) runRound(state);
  return JSON.stringify({ events: state.events, conservation: state.conservation });
}
{
  check(fullRunSnapshot(FUNCTIONAL_SEED, 40) === fullRunSnapshot(FUNCTIONAL_SEED, 40), "full rounds are deterministic for a fixed seed");
  check(fullRunSnapshot(FUNCTIONAL_SEED, 40) !== fullRunSnapshot(FUNCTIONAL_SEED + 1, 40), "a different seed yields a different full run");
}

// --- M3: FIRST_BRIDGE_ACCEPT emission (white-box) -------------------------
// Two agents, each with want = NONE but each valuing the OTHER's good by tally,
// so whichever acts first proposes a bridge and the partner accepts a non-want
// via the tally clause — a viaBridge trade that fires FIRST_BRIDGE_ACCEPT once,
// regardless of shuffle order. The other agents are emptied so only this pair acts.
{
  const state = createState(tradingPairFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  for (let p = 2; p < state.agents.length; p++) state.agents[p]!.held = null;
  const A = state.agents[0]!;
  const B = state.agents[1]!;
  A.held = instOf(0, 0);
  A.want = NONE;
  B.held = instOf(1, 0);
  B.want = NONE;
  for (let g = 0; g < state.goodCount; g++) {
    A.scorePos[g] = 0; A.scoreTot[g] = 0; A.prior[g] = 0;
    B.scorePos[g] = 0; B.scoreTot[g] = 0; B.prior[g] = 0;
  }
  A.prior[1] = 0.5; A.prior[0] = 0.1; // A values good 1 (B's good)
  B.prior[0] = 0.5; B.prior[1] = 0.1; // B values good 0 (A's good)

  const before = state.events.length;
  stepTrading(state, 1);
  const out = state.events.slice(before);
  const fba = out.filter((e) => e.type === "FIRST_BRIDGE_ACCEPT");
  const tr = out.filter((e) => e.type === "TRADE");
  check(tr.length === 1 && tr[0]!.type === "TRADE", "the want=NONE pair completes one trade");
  check(fba.length === 1, "FIRST_BRIDGE_ACCEPT fires exactly once");
  if (fba[0]!.type === "FIRST_BRIDGE_ACCEPT") {
    check(fba[0]!.qualifiers.length === 2, "both parties acquired a non-want, so one event carries both (D-028)");
    const roles = fba[0]!.qualifiers.map((q) => q.role).sort();
    check(roles[0] === "accepter" && roles[1] === "proposer", "the two qualifiers are the proposer and the accepter");
  }
}

// --- M3: D-028 either-party predicate — proposer-only qualification --------
// The case the accepter-only predicate missed: a bridge proposer's counterparty
// accepts the offer as its DIRECT want, so only the proposer acquires a non-want.
// Whichever agent ends up proposing, agent 0 (which values good 1 but does not
// want it) is the sole party that acquires a non-want, so it is the lone qualifier.
{
  const state = createState(tradingPairFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  for (let p = 2; p < state.agents.length; p++) state.agents[p]!.held = null;
  const A = state.agents[0]!;
  const B = state.agents[1]!;
  A.held = instOf(0, 0);
  A.want = NONE; // values good 1 by tally but wants nothing
  B.held = instOf(1, 0);
  B.want = 0; // directly wants good 0 (what A holds)
  for (let g = 0; g < state.goodCount; g++) {
    A.scorePos[g] = 0; A.scoreTot[g] = 0; A.prior[g] = 0;
    B.scorePos[g] = 0; B.scoreTot[g] = 0; B.prior[g] = 0;
  }
  A.prior[1] = 0.5; A.prior[0] = 0.1; // A's tally prefers good 1

  const before = state.events.length;
  stepTrading(state, 1);
  const out = state.events.slice(before);
  const fba = out.filter((e) => e.type === "FIRST_BRIDGE_ACCEPT");
  check(out.some((e) => e.type === "TRADE"), "a trade completes");
  check(fba.length === 1 && fba[0]!.type === "FIRST_BRIDGE_ACCEPT", "FIRST_BRIDGE_ACCEPT still fires when only the proposer acquires a non-want");
  if (fba[0]!.type === "FIRST_BRIDGE_ACCEPT") {
    check(fba[0]!.qualifiers.length === 1, "exactly one party qualifies (the other took its direct want)");
    const q = fba[0]!.qualifiers[0]!;
    check(q.party === 0 && q.acquiredGood === 1, "the qualifier is agent 0, which acquired the non-want good 1");
  }
}

// --- M3: white-box acceptance gates (evaluateAcceptance) ------------------
// Accumulators are zero here, so score(g) reduces to the prior we set, making
// the value test directly controllable. Good classes: 0=fine, 1=whole, 2/3=coarse.
function instOf(type: number, age: number, isFake = false): InstanceState {
  return { type, age, isFake, acquiredByTrade: false, acquiredRound: null };
}
function freshP(want: number, heldType: number): { state: EngineStateInternal; P: ReturnType<typeof mkP> } {
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  return { state, P: mkP(state, want, heldType) };
}
function mkP(state: EngineStateInternal, want: number, heldType: number) {
  const P = state.agents[0]!;
  P.want = want;
  P.held = instOf(heldType, 0);
  for (let g = 0; g < state.goodCount; g++) {
    P.prior[g] = 0;
    P.scorePos[g] = 0;
    P.scoreTot[g] = 0;
  }
  return P;
}
{
  // Accept, direct want: offered good 3 is P's want, fresh, compatible.
  const { state, P } = freshP(3, 0);
  const v = evaluateAcceptance(state, P, instOf(3, 0));
  check(v.accept && !v.viaBridge, "a fresh wanted good is accepted via the want clause (not bridge)");

  // Accept, bridge: offered good 3 (not want), but P's tally prefers it; fresh, compatible.
  const b = freshP(2, 0);
  b.P.prior[3] = 0.5;
  b.P.prior[0] = 0.1;
  const vb = evaluateAcceptance(b.state, b.P, instOf(3, 0));
  check(vb.accept && vb.viaBridge, "a non-want good is accepted via the bridge clause when the tally clears the margin");

  // Judgment-only refusal: non-want, tallies equal so the margin is not cleared.
  const j = freshP(2, 0);
  j.P.prior[3] = 0.2;
  j.P.prior[0] = 0.2;
  const vj = evaluateAcceptance(j.state, j.P, instOf(3, 0));
  check(!vj.accept && vj.reasons.length === 1 && vj.reasons[0] === "judgment", "equal tallies on a non-want give a judgment-only refusal");

  // Divisibility-only refusal: offered good 1 (whole) is P's want, but P holds good 2 (coarse).
  const d = freshP(1, 2);
  const vd = evaluateAcceptance(d.state, d.P, instOf(1, 0));
  check(!vd.accept && vd.reasons.length === 1 && vd.reasons[0] === "divisibility", "whole-vs-coarse is a divisibility-only refusal even for a wanted good");

  // Stale-only refusal: offered good 1 (not want) is stale; the bridge clause passes but the condition gate fails.
  const s = freshP(0, 0);
  s.P.prior[1] = 0.5;
  s.P.prior[0] = 0.1;
  const vs = evaluateAcceptance(s.state, s.P, instOf(1, 1)); // good 1 schedule s1=1: age 1 is stale
  check(!vs.accept && vs.reasons.length === 1 && vs.reasons[0] === "stale", "a stale non-want bridge is a stale-only refusal");

  // A stale good that IS the want is still acceptable (condition gate passes on want).
  const sw = freshP(1, 0);
  const vsw = evaluateAcceptance(sw.state, sw.P, instOf(1, 1));
  // good 1 (whole) vs held good 0 (fine) is divisibility-compatible, so this accepts.
  check(vsw.accept, "a stale good is still acceptable as a direct want");

  // Multi-reason refusal carries the full set, no precedence.
  const m = freshP(0, 2); // want good 0, holds good 2 (coarse)
  m.P.prior[1] = 0.2;
  m.P.prior[2] = 0.2;
  const vm = evaluateAcceptance(m.state, m.P, instOf(1, 1)); // good 1 whole, stale, not want, tally not cleared
  check(
    !vm.accept && vm.reasons.includes("judgment") && vm.reasons.includes("stale") && vm.reasons.includes("divisibility"),
    "a refusal carries the full set of failed gates with no precedence",
  );
}

// --- M3: refusal-aware direct priority (selectPartner) --------------------
{
  const state = createState(smallContrastFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  // A at position 0 holds good 0 (reach 5, covers the ring) and wants good 2.
  const A = state.agents[0]!;
  A.held = instOf(0, 0);
  A.want = 2;
  // Make positions 1 and 7 hold good 2 (reach 4); 1 is nearest.
  state.agents[1]!.held = instOf(2, 0);
  state.agents[7]!.held = instOf(2, 0);
  const empty = new Set<number>();

  const picked = selectPartner(state, 0, empty, 2);
  check(picked === 1, "direct priority picks the nearest holder of the want (position 1)");

  // Now A has witnessed position 1 refuse an offer of good 0, in-window.
  A.witnessedRefusals.push({ refuser: 1, offeredGood: 0, round: 1 });
  const picked2 = selectPartner(state, 0, empty, 2);
  check(picked2 !== 1, "a witnessed refusal excludes that partner from the direct priority");
  check(picked2 !== null && state.agents[picked2]!.held!.type === 2, "the fall-through still finds another holder of the want");
}

// =========================================================================
// M4 — statistics, detector, regions, telemetry (step 7). Pins (a)-(f).
// =========================================================================

// (a) A(g) counts each event ONCE globally, never per witness — it is not any
//     agent's tally (§9.1). One trade is one global event regardless of how many
//     agents witness it, whereas the per-agent tally increments per witness.
{
  const trade: EngineEvent = { type: "TRADE", round: 1, proposer: 0, partner: 1, goodFromProposer: 0, goodFromPartner: 1, viaBridge: false };
  const W = tradingPairFixture().constants.WINDOW_ROUNDS;

  const gstate = createState(tradingPairFixture(), FUNCTIONAL_SEED);
  writeBuckets(gstate, 1, [trade]);
  const globalTotal = gstate.goodStats[0]!.totBucket[1 % W]!;
  check(globalTotal === 1, "one trade is exactly one global event for good 0 (counted once)");
  check(windowedTrades(gstate.goodStats[0]!, 1, W) === 1, "good 0 has exactly one in-window trade event");

  const astate = createState(tradingPairFixture(), FUNCTIONAL_SEED);
  runSetup(astate); // positions the agents so witnessing is defined
  for (const ag of astate.agents) for (let g = 0; g < astate.goodCount; g++) { ag.scorePos[g] = 0; ag.scoreTot[g] = 0; }
  tallyUpdate(astate, 1, [trade]);
  let perWitnessSum = 0;
  for (const ag of astate.agents) perWitnessSum += ag.scoreTot[0]!;
  check(perWitnessSum > globalTotal, "the SAME trade increments many per-agent tallies (per witness) while A(g) counts it once");
}

// (b) Window membership and decay COMPOSE: in-window events carry age-decayed
//     weight (not flat), and an event older than WINDOW_ROUNDS falls out (§9.1).
{
  const W = 10;
  const DF = 0.8;
  const state = createState(tradingPairFixture(), FUNCTIONAL_SEED);
  const gs = state.goodStats[0]!;
  setBkt(gs, 0, W, 0, 1, 0); // a negative event at round 0
  setBkt(gs, 5, W, 1, 1, 0); // a positive event at round 5
  const A = computeA(gs, 5, W, DF);
  const expectedDecayed = 1 / (1 + Math.pow(DF, 5)); // round-0 event aged 5 rounds
  const flat = 1 / (1 + 1);
  check(A !== NO_EVIDENCE && Math.abs(A - expectedDecayed) < 1e-12, "in-window events are age-decayed, not flat-weighted");
  check(Math.abs(expectedDecayed - flat) > 1e-6, "(the decayed and flat values genuinely differ)");

  const gs2 = state.goodStats[1]!;
  setBkt(gs2, 5, W, 1, 1, 0);
  check(computeA(gs2, 14, W, DF) !== NO_EVIDENCE, "an event is in-window through round r+WINDOW_ROUNDS-1");
  check(computeA(gs2, 15, W, DF) === NO_EVIDENCE, "an event older than WINDOW_ROUNDS rounds falls out of the window");
}

// (c) The D7 rise baseline is the FIRST defined A(g) of the run, and does NOT
//     reset when the window empties to NO_EVIDENCE and later refills (§9.2).
{
  const config: Config = { ...tradingPairFixture(), constants: { ...tradingPairFixture().constants, WINDOW_ROUNDS: 1, ROUND_CAP: 100 } };
  const W = 1;
  const DF = config.constants.DECAY_FACTOR;
  const state = createState(config, FUNCTIONAL_SEED);
  const g0 = state.goodStats[0]!;
  const g1 = state.goodStats[1]!;

  setBkt(g0, 1, W, 9, 10, 0); setBkt(g1, 1, W, 1, 10, 0); stepStatistics(state, 1, []);
  check(g0.firstDefinedA === 0.9, "the first defined A(g) of the run is recorded");
  // round 2: good 0 has no events -> A empties to NO_EVIDENCE (window is 1 round).
  setBkt(g1, 2, W, 1, 10, 0); stepStatistics(state, 2, []);
  check(computeA(g0, 2, W, DF) === NO_EVIDENCE, "good 0's A empties to NO_EVIDENCE");
  check(g0.firstDefinedA === 0.9, "firstDefinedA survives the NO_EVIDENCE gap (not reset)");
  // round 3: good 0 refills with a DIFFERENT value.
  setBkt(g0, 3, W, 3, 10, 0); setBkt(g1, 3, W, 1, 10, 0); stepStatistics(state, 3, []);
  check(g0.firstDefinedA === 0.9, "firstDefinedA stays the run's first value after refill, not the refill value");
}

// Shared dominance-detector config: a 1-round window so each round's A and trade
// count are exactly that round's injected bucket (clean control of the clauses).
function detectorState() {
  const base = tradingPairFixture();
  const config: Config = {
    ...base,
    constants: { ...base.constants, WINDOW_ROUNDS: 1, DOM_SUSTAIN: 3, DOM_THRESHOLD: 0.7, DOM_GAP: 0.15, DOM_MIN_TRADE_SHARE: 0.1, DOM_RISE_MIN: 0.05, ROUND_CAP: 100 },
  };
  return createState(config, FUNCTIONAL_SEED);
}
const domCount = (state: ReturnType<typeof detectorState>, good: number) =>
  state.events.filter((e) => e.type === "DOMINANCE" && e.good === good).length;

// (d) The four detector clauses must hold JOINTLY on DOM_SUSTAIN consecutive
//     rounds; a single miss resets the streak (§9.2).
{
  const state = detectorState();
  const g0 = state.goodStats[0]!;
  const g1 = state.goodStats[1]!;
  const W = 1;
  // round 1: good 0 low (firstDefined small, so the rise clause can later pass).
  setBkt(g0, 1, W, 0, 1, 0); setBkt(g1, 1, W, 1, 10, 0); stepStatistics(state, 1, []);
  // rounds 2,3: all four clauses hold (A=0.9, gap 0.8, trades 6, rise 0.9).
  for (const r of [2, 3]) { setBkt(g0, r, W, 9, 10, 6); setBkt(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
  check(domCount(state, 0) === 0, "no dominance before the clauses hold for DOM_SUSTAIN consecutive rounds");
  setBkt(g0, 4, W, 9, 10, 6); setBkt(g1, 4, W, 1, 10, 0); stepStatistics(state, 4, []);
  check(domCount(state, 0) === 1 && state.dominantGood === 0, "DOMINANCE fires once the four clauses hold for DOM_SUSTAIN consecutive rounds");
}
{
  // reset: a clause miss mid-streak forces a fresh DOM_SUSTAIN run.
  const state = detectorState();
  const g0 = state.goodStats[0]!;
  const g1 = state.goodStats[1]!;
  const W = 1;
  setBkt(g0, 1, W, 0, 1, 0); setBkt(g1, 1, W, 1, 10, 0); stepStatistics(state, 1, []);
  setBkt(g0, 2, W, 9, 10, 6); setBkt(g1, 2, W, 1, 10, 0); stepStatistics(state, 2, []); // streak 1
  setBkt(g0, 3, W, 5, 10, 6); setBkt(g1, 3, W, 1, 10, 0); stepStatistics(state, 3, []); // A=0.5 < threshold -> reset
  for (const r of [4, 5]) { setBkt(g0, r, W, 9, 10, 6); setBkt(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
  check(domCount(state, 0) === 0, "a single clause miss resets the consecutive-round streak");
  setBkt(g0, 6, W, 9, 10, 6); setBkt(g1, 6, W, 1, 10, 0); stepStatistics(state, 6, []);
  check(domCount(state, 0) === 1, "dominance fires only after a fresh DOM_SUSTAIN consecutive run post-reset");
}

// (e) Leadership starts at none, skips NO_EVIDENCE, ties retain the incumbent;
//     and DOMINANCE re-fires on every rising edge (§9.2).
{
  const state = detectorState();
  const g0 = state.goodStats[0]!;
  const g1 = state.goodStats[1]!;
  const W = 1;
  const leadCount = () => state.events.filter((e) => e.type === "LEAD_CHANGE").length;
  // round 1: only good 0 defined -> it leads (NO_EVIDENCE good 1 is skipped).
  setBkt(g0, 1, W, 5, 10, 0); stepStatistics(state, 1, []);
  check(state.leader === 0 && leadCount() === 1, "leadership goes to the only defined good, skipping NO_EVIDENCE");
  // round 2: a tie retains the incumbent.
  setBkt(g0, 2, W, 5, 10, 0); setBkt(g1, 2, W, 5, 10, 0); stepStatistics(state, 2, []);
  check(state.leader === 0 && leadCount() === 1, "a tie for the max retains the incumbent leader");
  // round 3: a strict new max changes leadership.
  setBkt(g0, 3, W, 5, 10, 0); setBkt(g1, 3, W, 6, 10, 0); stepStatistics(state, 3, []);
  check(state.leader === 1 && leadCount() === 2, "a strictly-greatest different good changes leadership");
}
{
  // DOMINANCE re-fires after dominance is lost and regained.
  const state = detectorState();
  const g0 = state.goodStats[0]!;
  const g1 = state.goodStats[1]!;
  const W = 1;
  setBkt(g0, 1, W, 0, 1, 0); setBkt(g1, 1, W, 1, 10, 0); stepStatistics(state, 1, []);
  for (const r of [2, 3, 4]) { setBkt(g0, r, W, 9, 10, 6); setBkt(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
  check(domCount(state, 0) === 1, "good 0 reaches dominance");
  setBkt(g0, 5, W, 5, 10, 6); setBkt(g1, 5, W, 1, 10, 0); stepStatistics(state, 5, []); // A below threshold -> dominance lost
  for (const r of [6, 7, 8]) { setBkt(g0, r, W, 9, 10, 6); setBkt(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
  check(domCount(state, 0) === 2, "DOMINANCE re-fires on a fresh rising edge after dominance was lost");
}

// (f) Regions: a cross-border trade is attributed to BOTH parties' regions, so
//     the regional event sum legitimately exceeds the global count (§1, §9.3).
{
  const state = createState(scaledFixture(), FUNCTIONAL_SEED); // N=8, REGION_COUNT=2
  const W = state.config.constants.WINDOW_ROUNDS;
  // positions 0 and 4 are in different regions (arcs 0-3 and 4-7).
  const trade: EngineEvent = { type: "TRADE", round: 1, proposer: 0, partner: 4, goodFromProposer: 0, goodFromPartner: 1, viaBridge: false };
  writeBuckets(state, 1, [trade]);
  const i = 1 % W;
  const globalTot0 = state.goodStats[0]!.totBucket[i]!;
  const region0Tot0 = state.regionGoodStats[0]![0]!.totBucket[i]!;
  const region1Tot0 = state.regionGoodStats[1]![0]!.totBucket[i]!;
  check(globalTot0 === 1, "the cross-border trade is one global event for good 0");
  check(region0Tot0 === 1 && region1Tot0 === 1, "it is attributed to BOTH parties' regions");
  check(region0Tot0 + region1Tot0 > globalTot0, "regional sums legitimately exceed the global count for a cross-border event (specified, not a defect)");
}

// (g) End-to-end: a full run to the cap produces per-round telemetry, and a
//     non-converging market reports CAP_REACHED exactly once — a defined outcome
//     (G3), never a soft win.
{
  const cap = 30;
  const config: Config = { ...smallContrastFixture(), constants: { ...smallContrastFixture().constants, ROUND_CAP: cap } };
  const state = createState(config, FUNCTIONAL_SEED);
  runSetup(state);
  for (let r = 1; r <= cap; r++) runRound(state);

  check(state.telemetry.length === cap, "one telemetry snapshot per round");
  for (const t of state.telemetry) {
    check(Object.keys(t.acceptanceShare).length === state.goodCount, "telemetry reports A(g) for every good (incl. NO_EVIDENCE)");
    check(Number.isFinite(t.flow.produced) && Number.isFinite(t.flow.tradeMoves), "telemetry carries goods-flow counts");
  }
  const capEvents = state.events.filter((e) => e.type === "CAP_REACHED");
  check(capEvents.length === 1, "CAP_REACHED fires exactly once for a non-converging run");
  check(state.reachedCap === true && state.dominantGood === null, "the run records reachedCap with no dominant good");

  // Every score and every A(g) is a defined finite value through the whole run (G6).
  const lastA = state.telemetry[cap - 1]!.acceptanceShare;
  for (let g = 0; g < state.goodCount; g++) {
    const v = lastA[g]!;
    check(v === NO_EVIDENCE || Number.isFinite(v), "A(g) is always NO_EVIDENCE or a finite number (never an arbitrary value)");
  }
}

// (h) D-029 / H7: a single perishable good gets defined by spoilage, the detector
//     evaluates it with no runner-up, and returns a DEFINED "not dominant" — no
//     throw, no crash, a verdict the spec owes.
{
  const cap = 20;
  const state = createState(singleGoodPerishableFixture(), FUNCTIONAL_SEED);
  runSetup(state);
  // The detector branch must NOT throw at any point.
  for (let r = 1; r <= cap; r++) runRound(state); // would throw on the old escalation guard

  check(state.goodCount === 1, "the fixture has exactly one good");
  check(state.goodStats[0]!.firstDefinedA !== null, "spoilage defines the sole good (A becomes defined)");
  check(state.events.filter((e) => e.type === "SPOIL_DESTROY").length > 0, "the perishable good actually spoils");
  check(state.events.filter((e) => e.type === "DOMINANCE").length === 0, "a sole-defined good is never crowned dominant (no runner-up)");
  check(state.dominantGood === null, "no dominant good is recorded");
  check(state.events.some((e) => e.type === "CAP_REACHED"), "the run reaches the cap with a defined non-convergence outcome");
}

// =========================================================================
// M6 — ablation-mode smoke matrix. MECHANISM-level (each switch removes exactly
// its mechanic); the "zero measurable effect on outcomes" claim is distributional
// and runs with the statistical battery (criteria A1/A2 pending-with-note).
// =========================================================================
const ablationMatrix: string[] = [];
function smoke(label: string, ok: boolean, detail: string): void {
  check(ok, `${label}: ${detail}`);
  ablationMatrix.push(`  ${ok ? "OK" : "XX"}  ${label.padEnd(22)} ${detail}`);
}

// A2:durability — no aging or spoilage. smallContrast's good 1 normally spoils.
{
  const r = run({ ...smallContrastFixture(), ablation: { kind: "A2", attribute: "durability" } }, FUNCTIONAL_SEED);
  const spoils = r.events.filter((e) => e.type === "SPOIL_STAGE" || e.type === "SPOIL_DESTROY").length;
  const baseline = run(smallContrastFixture(), FUNCTIONAL_SEED).events.filter((e) => e.type === "SPOIL_STAGE" || e.type === "SPOIL_DESTROY").length;
  smoke("A2:durability", spoils === 0 && baseline > 0, "no aging transitions or spoilage (baseline spoils; ablated does not)");
}

// A2:recognizability — no fakes created. smallContrast's good 1 is fake-prone.
{
  const r = run({ ...smallContrastFixture(), ablation: { kind: "A2", attribute: "recognizability" } }, FUNCTIONAL_SEED);
  const fakes = r.events.filter((e) => e.type === "FAKE_REVEAL").length + r.events.filter((e) => e.type === "SPOIL_DESTROY" && e.wasFake).length;
  const baseFakes = run(smallContrastFixture(), FUNCTIONAL_SEED).events.filter((e) => e.type === "SPOIL_DESTROY" && e.wasFake).length;
  smoke("A2:recognizability", fakes === 0 && baseFakes > 0, "no fakes created (baseline has fake exits; ablated has none)");
}

// A2:divisibility — the size table always passes (no divisibility refusals).
{
  const r = run({ ...smallContrastFixture(), ablation: { kind: "A2", attribute: "divisibility" } }, FUNCTIONAL_SEED);
  const divRefusals = r.events.filter((e) => e.type === "REFUSAL" && e.reasons.includes("divisibility")).length;
  const baseDiv = run(smallContrastFixture(), FUNCTIONAL_SEED).events.filter((e) => e.type === "REFUSAL" && e.reasons.includes("divisibility")).length;
  smoke("A2:divisibility", divRefusals === 0 && baseDiv > 0, "divisibility table always passes (baseline has divisibility refusals; ablated has none)");
}

// A2:portability — reach is unrestricted (a far holder beyond normal reach is selectable).
{
  const mk = (abl: Config["ablation"]) => {
    const s = createState({ ...smallContrastFixture(), ablation: abl }, FUNCTIONAL_SEED);
    runSetup(s);
    s.agents[0]!.held = instOf(1, 0); // good 1, reach 2
    s.agents[0]!.want = 0;
    for (let p = 1; p < s.agents.length; p++) s.agents[p]!.held = instOf(p === 5 ? 0 : 2, 0); // only pos 5 holds good 0, far away (dist 5)
    return s;
  };
  const ablated = selectPartner(mk({ kind: "A2", attribute: "portability" }), 0, new Set<number>(), 2);
  const normal = selectPartner(mk({ kind: "none" }), 0, new Set<number>(), 2);
  smoke("A2:portability", ablated === 5 && normal !== 5, "reach unrestricted (ablated reaches the far holder pos 5; normal cannot)");
}

// A2:scarcity — production falls back to the profession policy regardless of weights.
{
  const weighted: Config = { ...tradingPairFixture(), productionPolicy: "weighted" };
  const r = run({ ...weighted, ablation: { kind: "A2", attribute: "scarcity" } }, FUNCTIONAL_SEED);
  // Under A2:scarcity every PRODUCE is the producing agent's homeGood (profession).
  const homeOf = weighted.homeGoods!;
  const offProfile = r.events.some((e) => e.type === "PRODUCE" && e.good !== homeOf[e.agent]);
  const baseVaries = run(weighted, FUNCTIONAL_SEED).events.some((e) => e.type === "PRODUCE" && e.good !== homeOf[e.agent]);
  smoke("A2:scarcity", !offProfile && baseVaries, "profession policy regardless of weights (baseline weighted draw varies; ablated is always homeGood)");
}

// A1 — BOTH halves: tallies frozen at the prior AND wants persist through consumption.
{
  const state = createState({ ...tradingPairFixture(), ablation: { kind: "A1" } }, FUNCTIONAL_SEED);
  runSetup(state);
  const initialWants = state.agents.map((a) => a.want);
  const evStart = state.events.length;
  for (let r = 0; r < 30; r++) runRound(state);
  const consumed = state.events.slice(evStart).filter((e) => e.type === "CONSUME").length;

  // Half 1: the accumulators never move off zero, so every score stays its prior.
  let frozen = true;
  for (const a of state.agents) for (let g = 0; g < state.goodCount; g++) if (a.scorePos[g] !== 0 || a.scoreTot[g] !== 0) frozen = false;
  // Contrast: without A1 the same fixture moves some accumulator off zero.
  const normal = createState(tradingPairFixture(), FUNCTIONAL_SEED);
  runSetup(normal);
  for (let r = 0; r < 30; r++) runRound(normal);
  let normalMoved = false;
  for (const a of normal.agents) for (let g = 0; g < normal.goodCount; g++) if (a.scoreTot[g] !== 0) normalMoved = true;
  smoke("A1 (tallies frozen)", frozen && normalMoved, "score accumulators stay at zero = frozen at the prior (normal run moves them)");

  // Half 2 (the one a partial impl misses): wants persist through consumption.
  const wantsPersist = state.agents.every((a, i) => a.want === initialWants[i]);
  smoke("A1 (wants pinned)", wantsPersist && consumed > 0, `wants persist through ${consumed} consumptions (no redraw)`);
}

// Rider #3 (explicit, once): ablation flags are CONFIG inputs, upstream of the
// pinned trace — the pinned fixture runs on the default ablation:none path, and
// setting it explicitly to none changes nothing. So ablations are not D-032-gated.
{
  const pf = pinningFixture();
  const isNone = pf.ablation.kind === "none";
  const a = JSON.stringify(run(pf, FUNCTIONAL_SEED).events);
  const b = JSON.stringify(run({ ...pf, ablation: { kind: "none" } }, FUNCTIONAL_SEED).events);
  smoke("default-off (none)", isNone && a === b, "the pin runs on ablation:none; setting none explicitly is byte-identical (config input, not D-032-gated)");
}

// M6 forward item — C0 campaign-runner machinery smoke (no tuning, no numbers).
{
  const base = smallContrastFixture();
  const c = base.constants as unknown as Record<string, number>;
  // Declare every registry-TBD constant at its structural-fixture value, authorized
  // by D-023 (NOT a teaching parameter). A real campaign cites real C0/H6 entries.
  const decls: TbdDeclaration[] = unfilledConstants().map((name) => ({
    constant: name,
    value: c[name]!,
    registerEntry: "D-023 (structural-fixture value; not a teaching parameter)",
  }));
  const spec: CampaignSpec = {
    name: "machinery-smoke",
    base,
    axes: [{ name: "ROUND_CAP", values: [15, 25], apply: (cfg, v) => ({ ...cfg, constants: { ...cfg.constants, ROUND_CAP: v as number } }) }],
    seedsPerConfig: 4,
    baseSeed: FUNCTIONAL_SEED,
    metrics: [
      { name: "events", extract: (r) => r.events.length },
      { name: "converged", extract: (r) => (r.dominantGood === null ? 0 : 1) },
    ],
    tbdDeclarations: decls,
    passPredicate: (r) => r.reachedCap,
  };
  const report = runCampaign(spec);
  check(report.cells.length === 2, "campaign sweeps the axis into 2 cells");
  for (const cell of report.cells) {
    check(cell.seeds === 4 && cell.metrics.events!.n === 4, "each cell runs an N-seed batch and summarizes distributionally (H2)");
    check(cell.passRate !== undefined && cell.passRate.total === 4, "a per-cell pass-rate is computed over the batch");
  }
  // H6 gate: drop one TBD declaration and the runner refuses to start.
  throws(() => runCampaign({ ...spec, tbdDeclarations: decls.slice(1) }), "the H6 intake refuses to run a campaign with an undeclared TBD constant");
}

console.log(`engine self-test OK — ${checks} checks passed (M1-M4; D-029; M6 ablations + campaign shell).`);
console.log("ablation smoke matrix:\n" + ablationMatrix.join("\n"));
