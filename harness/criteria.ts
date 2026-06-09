/**
 * The criteria assertion registry.
 *
 * One named assertion (or a small family of them) for every criterion in the
 * acceptance document — A1..A9, B1..B13, C0..C5, D1..D7, E1..E3, F1..F2,
 * G1..G6, H1..H7, I1..I12. Each carries a standalone `claim` so the battery is
 * legible without the private criteria document.
 *
 * Stage honesty (see harness/assert.ts): assertions that need the reference
 * engine, a tuned campaign configuration, or a learner-facing surface report
 * `pending` with the reason — never a false `pass`. The engine-independent,
 * fully-specified mechanics (the divisibility table, mutual reach, durability
 * staging, the tally event vocabulary, the constants denominations audit, the
 * version-stamp and bounds-discipline guards) execute now and can FAIL.
 *
 * Build-order note: the reference engine (step 2) is itself gated on four
 * decisions-register questions (A)-(D) (documented in engines/emergence/index.ts).
 * That is why the engine-dependent assertions are `pending` rather than wired:
 * the gate is upstream of them.
 */

import type { Assertion, AssertionResult } from "./assert.ts";
import { pass, fail, pending } from "./assert.ts";
import { makeRunRecord } from "./replay.ts";
import { hashConfig } from "./hash.ts";
import { CRITERIA_VERSION, ENGINE_VERSION } from "./version.ts";
import {
  CONSTANTS,
  ALLOWED_THRESHOLD_DENOMINATIONS,
  type Denomination,
} from "../engines/emergence/constants.ts";
import { TALLY_EVENT_TYPES, type EventType, type SizeClass } from "../engines/emergence/types.ts";
import { sizeCompatible } from "../engines/emergence/divisibility.ts";
import { stageOf } from "../engines/emergence/durability.ts";
import { ringDistance, mutualReachRadius, reachEligible } from "../engines/emergence/ring.ts";
import { fakeProbOf, scheduleOf, sizeClassOf, reachOf, wantShareOf } from "../engines/emergence/lookup.ts";
import { auditEnginePurity } from "./purity.ts";
import {
  run,
  structuralFixtures,
  serializeRun,
  tradingPairFixture,
  smallContrastFixture,
  singleGoodPerishableFixture,
  createState,
  runSetup,
  runRound,
  runToInternalState,
  selectPartner,
  validateConfig,
  tallyUpdate,
  stepStatistics,
  type GoodStatState,
} from "./engine-adapter.ts";
import { NO_EVIDENCE, type Config, type EngineEvent } from "../engines/emergence/types.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { passRate } from "./stats.ts";
import { refereeVerdict } from "./referee.ts";
import { verifyPin, PINNED_DIGEST } from "./project-seed-pin.ts";
import {
  E1_BAR,
  E2_BAR,
  E3_BAR,
  E3_CHANCE_BASELINE,
  C5_TEACHING_N,
  C5_FAIL_E3_N,
  c5TeachingConfig,
  c5FailE1Config,
  c5FailE2Config,
  c5FailE3Config,
  runScaledCell,
} from "./c5-calibration.ts";

/**
 * A functional seed for the engine-backed structural criteria — an arbitrary
 * fixed number chosen to exercise the engine, not for any outcome (D-010). The
 * PROJECT_SEED pinned trace is a separate, dedicated assertion.
 */
const STRUCTURAL_SEED = 20260607;

// --- Stage reasons -------------------------------------------------------

const CAMPAIGN_PENDING =
  "requires a tuned campaign configuration; tuned TBD constants unfilled (H6) and the engine is pending";
const SURFACE_PENDING =
  "requires a learner-facing surface, which does not exist yet (build-order steps 6-7)";

// --- Dominance-detector control (D7 lift, V-38) --------------------------
// A 1-round window so each round's A(g) and trade count are exactly that round's
// injected bucket — direct control of the four dominance clauses in the NAMED
// battery (the same white-box construction the engine self-test uses, lifted
// here so the per-capita trade floor and the rise clause are acceptance criteria,
// not selftest-only).
function detectorControlConfig(): Config {
  const base = tradingPairFixture();
  return {
    ...base,
    constants: { ...base.constants, WINDOW_ROUNDS: 1, DOM_SUSTAIN: 3, DOM_THRESHOLD: 0.7, DOM_GAP: 0.15, DOM_MIN_TRADE_SHARE: 0.1, DOM_RISE_MIN: 0.05, ROUND_CAP: 100 },
  };
}
function setDetectorBucket(gs: GoodStatState, round: number, window: number, pos: number, tot: number, trade: number): void {
  const i = round % window;
  gs.posBucket[i] = pos;
  gs.totBucket[i] = tot;
  gs.tradeBucket[i] = trade;
  gs.bucketRound[i] = round;
}
function dominanceCount(events: readonly EngineEvent[], good: number): number {
  return events.filter((e) => e.type === "DOMINANCE" && e.good === good).length;
}
/** A detector-control config at a given population N and window (G4 denomination check). */
function detectorConfigN(n: number, window: number): Config {
  const base = tradingPairFixture();
  return {
    ...base,
    ringSize: n,
    homeGoods: Array.from({ length: n }, (_, i) => i % 2),
    constants: { ...base.constants, WINDOW_ROUNDS: window, DOM_SUSTAIN: 3, DOM_THRESHOLD: 0.7, DOM_GAP: 0.15, DOM_MIN_TRADE_SHARE: 0.1, DOM_RISE_MIN: 0.05, ROUND_CAP: 100 },
  };
}

/** A criterion that needs both the engine and tuned teaching/synthesis parameters. */
function campaignCriterion(id: string, criterion: string, claim: string): Assertion {
  return { id, criterion, claim, evaluate: (): AssertionResult => pending(CAMPAIGN_PENDING) };
}

/** A criterion that needs a shipped surface. */
function surfaceCriterion(id: string, criterion: string, claim: string): Assertion {
  return { id, criterion, claim, evaluate: (): AssertionResult => pending(SURFACE_PENDING) };
}

// --- A. Emergence integrity ---------------------------------------------

const A: Assertion[] = [
  campaignCriterion(
    "A1",
    "A1 — Tally ablation",
    "With acceptance-tally learning frozen after seeding and wants pinned to their initial draw, convergence " +
      "must degrade by at least the registered minimum — otherwise convergence was baked into the static demand " +
      "structure. The A1 MODE itself (tallies frozen at the prior AND wants persisting through consumption) is " +
      "smoke-tested at M6 (engine self-test); the convergence-degradation grading is distributional and runs " +
      "with the statistical battery (threshold is an H6 TBD).",
  ),
  campaignCriterion(
    "A2",
    "A2 — Mechanic ablation, per property",
    "For each property with a mechanical effect (durability, recognizability, divisibility, portability, " +
      "scarcity): disabling the mechanic while leaving the displayed level set must give that level zero " +
      "measurable effect on outcomes. Each switch's MECHANISM removal is smoke-tested at M6 (engine self-test " +
      "ablation matrix: durability off -> no aging; recognizability off -> no fakes; divisibility off -> table " +
      "always passes; portability off -> reach unrestricted; scarcity off -> profession policy). The " +
      "zero-measurable-effect-on-outcomes claim is distributional and runs with the statistical battery.",
  ),
  {
    id: "A3",
    criterion: "A3 — No global knowledge",
    claim:
      "In local-information mode, no agent decision reads state outside its own neighborhood. An event's " +
      "only decision-relevant effect is on the acceptance tallies of agents within the witness radius of a " +
      "participant; an agent beyond that radius sees no change to its scores — its decision inputs — from the " +
      "event. Information reaches a distant agent only later, once it propagates through trades it witnesses.",
    evaluate: (): AssertionResult => {
      // A small witness radius on a 10-ring leaves some agents genuinely outside.
      const radius = 2;
      const base = smallContrastFixture();
      const cfg: Config = { ...base, constants: { ...base.constants, WITNESS_RADIUS: radius } };
      const state = createState(cfg, STRUCTURAL_SEED);
      runSetup(state);
      // Zero the score accumulators so the only movement is this one event's.
      for (const a of state.agents) for (let g = 0; g < state.goodCount; g++) { a.scorePos[g] = 0; a.scoreTot[g] = 0; }
      const trade: EngineEvent = { type: "TRADE", round: 1, proposer: 0, partner: 1, goodFromProposer: 0, goodFromPartner: 1, viaBridge: false };
      tallyUpdate(state, 1, [trade]);
      let insideChanged = 0;
      let outsideTouched = 0;
      for (const a of state.agents) {
        const dist = Math.min(ringDistance(a.position, 0, cfg.ringSize), ringDistance(a.position, 1, cfg.ringSize));
        const changed = a.scoreTot.some((v) => v !== 0) || a.scorePos.some((v) => v !== 0);
        if (dist <= radius) { if (changed) insideChanged++; }
        else if (changed) outsideTouched++;
      }
      if (outsideTouched > 0) {
        return fail(`${outsideTouched} agents beyond the witness radius had tallies changed by a distant event — a global-knowledge leak`);
      }
      if (insideChanged === 0) return fail("no in-radius agent registered the event; witnessing is broken, the test is vacuous");
      return pass(`a distant event moves only in-radius tallies: ${insideChanged} in-radius witnesses updated, 0 out-of-radius agents touched`, { insideChanged });
    },
  },
  campaignCriterion(
    "A5",
    "A5 — Winner not hardcoded",
    "Re-running the synthesis configuration with the focal goods' property profiles swapped between goods " +
      "swaps the winner at the same rate. The good's identity is irrelevant; only properties and demand " +
      "decide who wins.",
  ),
  {
    id: "A6.vocabulary",
    criterion: "A6 — Witnessable inputs only (vocabulary)",
    claim:
      "Exactly four event types may enter an acceptance tally, and all four are events an agent could " +
      "witness in the world: a completed trade, a refusal it was party to or adjacent to, a fake revealed, " +
      "and a spoilage destruction. No private verdict, synthetic event, or global statistic is in the set.",
    evaluate: (): AssertionResult => {
      const expected: readonly EventType[] = ["TRADE", "REFUSAL", "FAKE_REVEAL", "SPOIL_DESTROY"];
      const got = [...TALLY_EVENT_TYPES].sort();
      const want = [...expected].sort();
      const equal = got.length === want.length && got.every((x, i) => x === want[i]);
      return equal
        ? pass(`tally event vocabulary is exactly {${want.join(", ")}}`)
        : fail(`tally event vocabulary mismatch: got {${got.join(", ")}}, expected {${want.join(", ")}}`);
    },
  },
  {
    id: "A6.composition",
    criterion: "A6 — Witnessable inputs only (event-record composition)",
    claim:
      "Over a run, 100% of the tally's event record traces to the four witnessable event types — a trade, a " +
      "refusal, a fake reveal, a spoilage destruction. The per-round composition telemetry accounts for every " +
      "one of those events and nothing else; the seeded prior is not an event and never appears in the record.",
    evaluate: (): AssertionResult => {
      const r = run(tradingPairFixture(), STRUCTURAL_SEED);
      const tallyTypes = new Set<string>(TALLY_EVENT_TYPES);
      const logCounts: Record<string, number> = {};
      for (const e of r.events) if (tallyTypes.has(e.type)) logCounts[e.type] = (logCounts[e.type] ?? 0) + 1;

      const telCounts: Record<string, number> = {};
      for (const t of r.telemetry) {
        for (const [k, v] of Object.entries(t.eventRecordComposition)) telCounts[k] = (telCounts[k] ?? 0) + v;
      }
      // Every composition key must be a tally type, and the counts must match the
      // event log exactly (the telemetry accounts for 100% of the witnessable events).
      for (const k of Object.keys(telCounts)) {
        if (!tallyTypes.has(k)) return fail(`composition telemetry counts a non-tally event type '${k}'`);
        if ((telCounts[k] ?? 0) !== (logCounts[k] ?? 0)) {
          return fail(`composition mismatch for ${k}: telemetry ${telCounts[k]} vs event log ${logCounts[k]}`);
        }
      }
      for (const k of Object.keys(logCounts)) {
        if ((telCounts[k] ?? 0) !== logCounts[k]) return fail(`event log has ${k} the composition telemetry missed`);
      }
      const total = Object.values(logCounts).reduce((s, x) => s + x, 0);
      return pass(`100% of the ${total} tally events trace to the four witnessable types`, { tallyEvents: total });
    },
  },
  {
    id: "A6.prior",
    criterion: "A6 — Seeded-prior initialization assertion",
    claim:
      "Every agent's seeded prior equals the registered formula exactly: the capped share of its visible " +
      "neighbours (within W_r, excluding itself) whose want is the good. Checked by independent recomputation " +
      "at setup, not inferred from behaviour. The prior is not an event and never enters the event record.",
    evaluate: (): AssertionResult => {
      let checked = 0;
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        const state = createState(cfg, STRUCTURAL_SEED);
        runSetup(state);
        const wr = cfg.constants.WITNESS_RADIUS;
        const cap = cfg.constants.SEED_CAP;
        for (let pos = 0; pos < cfg.ringSize; pos++) {
          for (let g = 0; g < state.goodCount; g++) {
            let total = 0;
            let count = 0;
            for (let j = 0; j < cfg.ringSize; j++) {
              if (j === pos) continue;
              if (ringDistance(pos, j, cfg.ringSize) <= wr) {
                total++;
                if (state.agents[j]!.want === g) count++;
              }
            }
            const expected = Math.min(total > 0 ? count / total : 0, cap);
            checked++;
            if (Math.abs(state.agents[pos]!.prior[g]! - expected) > 1e-12) {
              return fail(`${f.name}: prior mismatch at agent ${pos}, good ${g}`);
            }
          }
        }
      }
      return pass(`every seeded prior matches the capped-local-want-share formula (${checked} checked)`, { checked });
    },
  },
  campaignCriterion(
    "A7",
    "A7 — No categorical fiat (monotonic across levels)",
    "Stepping a single attribute from its worst to its best level, all else held identical, produces a " +
      "monotonically non-decreasing focal-good win rate, with every step's effect arriving through event " +
      "dynamics — never a floor, threshold, or category rule. A perishable loses because spoilage events " +
      "destroy its candidacy, not because a rule disqualifies it before events can answer.",
  ),
  {
    id: "A8.mapping",
    criterion: "A8(a) — Same label, same mechanics (mapping audit, per D-031)",
    claim:
      "Every engine parameter a good carries — fake probability, durability schedule, size class, reach radius, " +
      "want-share weight — is exactly the registered level mapping indexed by that good's level, with NO per-good " +
      "adjustment beneath the label. So two goods at the same level get identical parameter packs. (A8's original " +
      "fixed-seed relabel-equivariance was ruled unsatisfiable for any deterministic engine — D-031.)",
    evaluate: (): AssertionResult => {
      let checked = 0;
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        const m = cfg.mapping;
        for (const g of cfg.goods) {
          const at = g.attributes;
          checked++;
          if (fakeProbOf(cfg, g.id) !== m.fakeProbability[at.recognizability]) return fail(`${f.name} good ${g.id}: fake prob not the level mapping`);
          if (JSON.stringify(scheduleOf(cfg, g.id)) !== JSON.stringify(m.durabilitySchedule[at.durability])) return fail(`${f.name} good ${g.id}: schedule not the level mapping`);
          if (sizeClassOf(cfg, g.id) !== m.sizeClass[at.divisibility]) return fail(`${f.name} good ${g.id}: size class not the level mapping`);
          if (reachOf(cfg, g.id) !== m.reachRadius[at.portability]) return fail(`${f.name} good ${g.id}: reach not the level mapping`);
          if (wantShareOf(cfg, g.id) !== m.wantShareWeight[at.desirability]) return fail(`${f.name} good ${g.id}: want-share not the level mapping`);
        }
      }
      return pass(`every good's parameter pack is the registered mapping indexed by level (${checked} goods, no per-good adjustment)`, { checked });
    },
  },
  {
    id: "A8.blindness",
    criterion: "A8(b) — Identity-blindness (code audit anchored on A8(a), per D-031)",
    claim:
      "Good identity enters no decision, weight, or parameter except through the level mapping (A8(a)) and the " +
      "registered symmetry-breaking conventions (the type-index draw order and the lowest-type-index tie-break, " +
      "D-015/D-022). Mechanical anchor: any two goods with IDENTICAL full profiles carry byte-identical parameter " +
      "packs everywhere they appear — a rigged per-id number would break this even where it hides behind matching labels.",
    evaluate: (): AssertionResult => {
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        for (const a of cfg.goods) {
          for (const b of cfg.goods) {
            if (a.id >= b.id) continue;
            if (JSON.stringify(a.attributes) !== JSON.stringify(b.attributes)) continue; // only identical profiles
            const packA = [fakeProbOf(cfg, a.id), JSON.stringify(scheduleOf(cfg, a.id)), sizeClassOf(cfg, a.id), reachOf(cfg, a.id), wantShareOf(cfg, a.id)];
            const packB = [fakeProbOf(cfg, b.id), JSON.stringify(scheduleOf(cfg, b.id)), sizeClassOf(cfg, b.id), reachOf(cfg, b.id), wantShareOf(cfg, b.id)];
            if (JSON.stringify(packA) !== JSON.stringify(packB)) {
              return fail(`${f.name}: goods ${a.id} and ${b.id} have identical profiles but different parameter packs`);
            }
          }
        }
      }
      return pass("identically-profiled goods carry identical parameter packs everywhere; identity enters only via mapping + registered conventions");
    },
  },
  {
    id: "A8.distributional",
    criterion: "A8(c) — Distributional relabel swap (per D-031)",
    claim:
      "A same-level pair's OUTCOME statistics swap under relabeling within a registered tolerance (A5 machinery; " +
      "the deterministic event stream cannot match exactly — D-031 — but the distribution must). This runs with " +
      "the statistical battery alongside A1/A5/A7; the tolerance is an H6 TBD, filled before its campaign.",
    evaluate: (): AssertionResult =>
      pending("A8(c) distributional outcome-swap runs with the A1/A5/A7 statistical battery; tolerance is an H6 TBD (per D-031)"),
  },
  {
    id: "A9",
    criterion: "A9 — The trace is the computation",
    claim:
      "An INDEPENDENT referee — reimplemented from spec §6.2's text, importing no engine decision code — " +
      "reproduces every accept/reject verdict from a decision trace's listed inputs alone. A trace that " +
      "decorated a verdict it could not derive would be caught here, on the one surface built to prevent it.",
    evaluate: (): AssertionResult => {
      let checked = 0;
      for (const f of structuralFixtures()) {
        const r = run(f.config, STRUCTURAL_SEED);
        for (const e of r.events) {
          if (e.type !== "DECISION_TRACE") continue;
          checked++;
          const derived = refereeVerdict(e.inputs);
          if (derived !== e.verdict) {
            return fail(`${f.name}: referee derived '${derived}' but the trace records '${e.verdict}' — inputs ${JSON.stringify(e.inputs)}`);
          }
        }
      }
      if (checked === 0) return fail("no decision traces were available to verify");
      return pass(`an independent §6.2 referee reproduced all ${checked} verdicts from trace inputs alone`, { checked });
    },
  },
];

// --- B. Mechanic-level criteria -----------------------------------------

const B: Assertion[] = [
  campaignCriterion(
    "B1",
    "B1 — Re-endowment loop",
    "When an agent's good exits (consumed, spoiled, or revealed fake) it re-enters with a new good (and, on " +
      "consumption, a new want) within the budgeted rounds; over a long teaching run the count of agents " +
      "that were party to a completed trade never trends to zero. An all-refusal freeze fails this by name.",
  ),
  {
    id: "B2.schedule",
    criterion: "B2 — Durability staging (schedule semantics)",
    claim:
      "A good's condition is a pure function of its instance age and its durability schedule: fresh while " +
      "age < s1, stale while s1 <= age < s1+s2, destroyed at the tick reaching s1+s2; a never-spoils good " +
      "ages without ever leaving fresh.",
    evaluate: (): AssertionResult => {
      const sched = { s1: 2, s2: 3, neverSpoils: false };
      const cases: Array<[number, string]> = [
        [0, "fresh"], [1, "fresh"], [2, "stale"], [4, "stale"], [5, "destroyed"], [9, "destroyed"],
      ];
      for (const [age, want] of cases) {
        const got = stageOf(age, sched);
        if (got !== want) return fail(`schedule (s1=2,s2=3): age ${age} -> ${got}, expected ${want}`);
      }
      const never = { s1: 2, s2: 3, neverSpoils: true };
      if (stageOf(1000, never) !== "fresh") return fail("never-spoils good did not stay fresh at age 1000");
      return pass("fresh/stale/destroyed boundaries and never-spoils behavior match the schedule semantics");
    },
  },
  {
    id: "B2.staleTrade",
    criterion: "B2 — No completed trade leaves a stale non-want held",
    claim:
      "Stale goods are refused as bridge acquisitions by all agents while remaining acceptable as direct " +
      "wants; the invariant over a run is that no completed trade ever leaves any party holding a stale " +
      "instance of a type other than its current want. The proposer-side condition gate forbids acquiring a " +
      "stale good as a bridge — so an instance an agent just received in a trade is never both stale and not " +
      "its want.",
    evaluate: (): AssertionResult => {
      let checkedRounds = 0;
      let acquisitionsChecked = 0;
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        const state = createState(cfg, STRUCTURAL_SEED);
        runSetup(state);
        for (let round = 1; round <= cfg.constants.ROUND_CAP; round++) {
          runRound(state);
          checkedRounds++;
          for (const a of state.agents) {
            const held = a.held;
            // Only instances acquired by a completed trade THIS round (no aging has
            // touched them since the swap, so this is exactly the post-trade state).
            if (held === null || held.acquiredRound !== round) continue;
            acquisitionsChecked++;
            const stage = stageOf(held.age, scheduleOf(cfg, held.type));
            if (stage === "stale" && held.type !== a.want) {
              return fail(
                `${f.name} round ${round}: agent ${a.position} was left holding a stale non-want (good ${held.type}, want ${a.want}) by a completed trade`,
              );
            }
          }
        }
      }
      return pass(
        `no completed trade left a party holding a stale non-want across ${checkedRounds} rounds (${acquisitionsChecked} trade acquisitions checked)`,
        { acquisitionsChecked },
      );
    },
  },
  {
    id: "B3",
    criterion: "B3 — Recognizability reveal & fake exit accounting",
    claim:
      "Every instance created fake exits through an exit event and never as a satisfied want: a fake is " +
      "destroyed on reveal (after a trade, or on attempted consumption) or — if it rots before discovery — on " +
      "spoilage, and the per-channel conservation ledger attributes every one of those exits to the fake " +
      "channel exactly. The RATE at which fakes are created is a distributional/campaign measurement and is " +
      "not graded here.",
    evaluate: (): AssertionResult => {
      let fakeExitsLedger = 0;
      let fakeExitEvents = 0;
      let withFakes = 0;
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        const s = runToInternalState(cfg, STRUCTURAL_SEED);
        const ledger = s.conservation.fake.reduce((acc, x) => acc + x, 0);
        // Fake exits in the event stream: every FAKE_REVEAL, plus every SPOIL_DESTROY
        // whose lost instance was fake (a fake lost to rot before discovery).
        let events = 0;
        for (const e of s.events) {
          if (e.type === "FAKE_REVEAL") events++;
          else if (e.type === "SPOIL_DESTROY" && e.wasFake) events++;
        }
        if (ledger !== events) {
          return fail(`${f.name}: fake ledger (${ledger}) != fake exit events (${events}) — a fake exit was misattributed or lost`);
        }
        fakeExitsLedger += ledger;
        fakeExitEvents += events;
        if (ledger > 0) withFakes++;
      }
      if (withFakes === 0) return fail("no fixture produced a fake exit; the exit-accounting claim is untested");
      return pass(
        `every fake exit is attributed to the fake channel exactly: ${fakeExitsLedger} ledger exits == ${fakeExitEvents} exit events, over ${withFakes} fixtures with fakes (creation rate uncovered — campaign claim)`,
        { fakeExits: fakeExitsLedger },
      );
    },
  },
  {
    id: "B4.table",
    criterion: "B4 — Divisibility verdict purity",
    claim:
      "The size-compatibility verdict is a pure function of the two goods' size classes and follows the " +
      "fixed table exactly — fine matches anything, coarse matches coarse, a whole lump clears only against " +
      "fine — the same pair giving the same verdict every time, with no re-rolls.",
    evaluate: (): AssertionResult => {
      const classes: readonly SizeClass[] = ["fine", "coarse", "whole"];
      // Expected table, transcribed from the spec.
      const expected: Record<string, boolean> = {
        "fine,fine": true, "fine,coarse": true, "fine,whole": true,
        "coarse,fine": true, "coarse,coarse": true, "coarse,whole": false,
        "whole,fine": true, "whole,coarse": false, "whole,whole": false,
      };
      for (const a of classes) {
        for (const b of classes) {
          const got = sizeCompatible(a, b);
          const want = expected[`${a},${b}`]!;
          if (got !== want) return fail(`size-compat(${a},${b})=${got}, expected ${want}`);
          // Determinism / symmetry of the verdict.
          if (sizeCompatible(a, b) !== sizeCompatible(b, a)) return fail(`verdict not symmetric for (${a},${b})`);
        }
      }
      return pass("all 9 class pairs match the spec table and the verdict is symmetric and deterministic");
    },
  },
  {
    id: "B5.mutualReach",
    criterion: "B5 — Portability reach (mutual minimum)",
    claim:
      "Trade eligibility distance is the MINIMUM of the two goods' reach radii, so a bulky good can never " +
      "be pulled beyond its own radius by a light-good counterparty. Reach is the only channel of portability " +
      "effect; there is no portability score multiplier.",
    evaluate: (): AssertionResult => {
      // Mutual minimum is symmetric and never exceeds either radius.
      if (mutualReachRadius(2, 5) !== 2 || mutualReachRadius(5, 2) !== 2) {
        return fail("mutual reach radius is not the symmetric minimum of the two radii");
      }
      const n = 20;
      // A pair 4 apart: eligible when both radii >= 4; ineligible if the bulky side's radius is 2.
      if (!reachEligible(0, 4, n, 5, 5)) return fail("pair within both radii judged ineligible");
      if (reachEligible(0, 4, n, 2, 9)) {
        return fail("a light counterparty (r=9) pulled a bulky good (r=2) beyond its own radius");
      }
      if (ringDistance(0, 4, n) !== 4) return fail("ring distance miscomputed");
      return pass("eligibility uses the mutual minimum radius; the bulky side's radius bounds the trade");
    },
  },
  {
    id: "B6",
    criterion: "B6 — Desirability isolation",
    claim:
      "Changing a focal good's desirability reallocates want-share only against the background filler pool; " +
      "the other focal goods' want-shares stay fixed by construction, so a pairwise comparison is never moved " +
      "by a third good's dial. (The prior build's normalized demand made held-constant comparisons impossible " +
      "— a third good's move shifted the narrated pairwise contest.)",
    evaluate: (): AssertionResult => {
      // Two configs differing ONLY in focal good 0's desirability level.
      const base = smallContrastFixture();
      const withGood0Desirability = (level: 0 | 1 | 2): Config => ({
        ...base,
        goods: base.goods.map((g) => (g.id === 0 ? { ...g, attributes: { ...g.attributes, desirability: level } } : g)),
      });
      const lo = withGood0Desirability(0);
      const hi = withGood0Desirability(2);

      // The OTHER focal good's want-share is identical across the two — fixed by construction.
      const g1lo = wantShareOf(lo, 1);
      const g1hi = wantShareOf(hi, 1);
      if (Math.abs(g1lo - g1hi) > 1e-12) {
        return fail(`good 1's want-share moved (${g1lo} -> ${g1hi}) when only good 0's desirability changed`);
      }
      // Good 0's share moved; the filler remainder absorbs exactly that delta.
      const focalDelta = wantShareOf(hi, 0) - wantShareOf(lo, 0);
      const fillerLo = 1 - wantShareOf(lo, 0) - g1lo;
      const fillerHi = 1 - wantShareOf(hi, 0) - g1hi;
      if (Math.abs(focalDelta) < 1e-12) return fail("good 0's desirability change did not move its want-share; the test is vacuous");
      if (Math.abs(focalDelta + (fillerHi - fillerLo)) > 1e-12) {
        return fail(`the filler pool did not absorb good 0's delta (focal +${focalDelta.toFixed(4)}, filler ${(fillerHi - fillerLo).toFixed(4)})`);
      }
      return pass(`good 0's desirability change moved ${focalDelta.toFixed(4)} of want-share entirely against the filler pool; good 1 unchanged`);
    },
  },
  campaignCriterion(
    "B7",
    "B7 — Scarcity injection (engine hook)",
    "With the scarcity production policy active, low-scarcity goods enter via re-endowment at the configured " +
      "rate; under Week 1's locked uniform setting injection is identical for all goods. The hook exists and " +
      "passes even though no Week 1 surface exposes it.",
  ),
  campaignCriterion(
    "B8",
    "B8 — Scarcity consequence",
    "A good set to low scarcity has its acceptance share collapse relative to an otherwise-identical baseline, " +
      "and the collapse signature holds across the exposed lever's full range at a registered grid and " +
      "pass-rate floor — not at a single lucky setting.",
  ),
  campaignCriterion(
    "B9",
    "B9 — Goods-flow budget",
    "At teaching parameters, goods relocated by trade per round exceed goods entering hands by re-endowment " +
      "(consumption + spoilage + fake disposal) by at least the registered factor, measured per channel. A " +
      "market whose largest flow is the disposal faucet makes every stock display a lie about the winner.",
  ),
  {
    id: "B10",
    criterion: "B10 — One time base (denominations audit)",
    claim:
      "Every rolling-statistic, window, and detector threshold constant is denominated in rounds, shares, or " +
      "per-capita rates — never in raw event counts. A threshold expressed in raw counts drifts with " +
      "population and breaks the single time base.",
    evaluate: (): AssertionResult => {
      const allowed = new Set<Denomination>(ALLOWED_THRESHOLD_DENOMINATIONS);
      const offenders: string[] = [];
      for (const c of CONSTANTS) {
        if (c.denomination === "eventCount") {
          offenders.push(`${c.name} (raw event count)`);
          continue;
        }
        if (c.isThreshold && !allowed.has(c.denomination)) {
          offenders.push(`${c.name} (threshold denominated in '${c.denomination}')`);
        }
      }
      return offenders.length === 0
        ? pass(`all ${CONSTANTS.length} constants pass the denominations audit (no raw event-count thresholds)`)
        : fail(`denominations audit failed: ${offenders.join("; ")}`);
    },
  },
  {
    id: "B11",
    criterion: "B11 — Semantic event stream",
    claim:
      "Every emitted event is a typed, consumable record (a known type with a round and its payload), so " +
      "narration can bind to event types and predicates rather than to trace facts. (The beat-misfire rate over " +
      "a beat system is a campaign measurement; this asserts the typed-stream foundation it stands on.)",
    evaluate: (): AssertionResult => {
      const known = new Set<string>([
        "PRODUCE", "TRADE", "REFUSAL", "SPOIL_STAGE", "SPOIL_DESTROY", "FAKE_REVEAL", "CONSUME",
        "FIRST_BRIDGE_ACCEPT", "LEAD_CHANGE", "REGION_LEADER", "REGIONS_MERGED", "DOMINANCE",
        "CAP_REACHED", "FILLER_PROMOTED", "DECISION_TRACE",
      ]);
      let checked = 0;
      for (const f of structuralFixtures()) {
        const r = run(f.config, STRUCTURAL_SEED);
        for (const e of r.events) {
          checked++;
          if (!known.has(e.type)) return fail(`${f.name}: emitted an unknown event type '${e.type}'`);
          if (typeof e.round !== "number") return fail(`${f.name}: a ${e.type} event has no round`);
        }
      }
      return pass(`every one of ${checked} emitted events is a known typed record with a round`, { checked });
    },
  },
  {
    id: "B12",
    criterion: "B12 — Conservation closes",
    claim:
      "Every good's live instance count equals what production put in minus everything that exited (consumed, " +
      "spoiled, fake-disposed), with the setup endowment charged to production — zero unexplained deltas. The " +
      "engine neither leaks nor mints instances outside the named channels.",
    evaluate: (): AssertionResult => {
      for (const f of structuralFixtures()) {
        const s = runToInternalState(f.config, STRUCTURAL_SEED);
        for (let g = 0; g < s.goodCount; g++) {
          const cs = s.conservation;
          const expected = cs.produced[g]! - cs.consumed[g]! - cs.spoiled[g]! - cs.fake[g]!;
          if (cs.live[g]! !== expected) return fail(`${f.name} good ${g}: live ${cs.live[g]} != production-minus-exits ${expected}`);
          if (cs.live[g]! < 0) return fail(`${f.name} good ${g}: negative live count`);
        }
      }
      return pass("conservation closes for every good across all fixtures (live = production - all exits, >= 0)");
    },
  },
  {
    id: "B13",
    criterion: "B13 — No permanent refusal-lock",
    claim:
      "When an agent's only reachable holder of its want has been witnessed refusing the agent's good, the " +
      "refusal-aware direct priority excludes that partner and the agent falls through to a NON-direct (bridge) " +
      "proposal rather than locking. A market cannot freeze on a single deterministic refuser.",
    evaluate: (): AssertionResult => {
      const cfg = smallContrastFixture();
      const state = createState(cfg, STRUCTURAL_SEED);
      runSetup(state);
      const inst = (type: number) => ({ type, age: 0, isFake: false, acquiredByTrade: false, acquiredRound: null });
      // A (pos 0) holds good 0, wants good 1. Only pos 1 holds good 1; pos 2 holds
      // good 2 (which A's tally values); everyone else holds good 3.
      const A = state.agents[0]!;
      A.held = inst(0);
      A.want = 1;
      state.agents[1]!.held = inst(1);
      state.agents[2]!.held = inst(2);
      for (let p = 3; p < cfg.ringSize; p++) state.agents[p]!.held = inst(3);
      for (let g = 0; g < state.goodCount; g++) { A.prior[g] = 0; A.scorePos[g] = 0; A.scoreTot[g] = 0; }
      A.prior[2] = 0.5; A.prior[0] = 0.1; A.prior[1] = 0.1;

      const direct = selectPartner(state, 0, new Set<number>(), 2);
      if (direct !== 1) return fail(`without a refusal, the agent should direct-propose to the want-holder (pos 1), got ${direct}`);

      // A has witnessed pos 1 refuse an offer of good 0, in-window.
      A.witnessedRefusals.push({ refuser: 1, offeredGood: 0, round: 1 });
      const fallThrough = selectPartner(state, 0, new Set<number>(), 2);
      if (fallThrough === 1) return fail("the witnessed refuser was not excluded from the direct priority");
      if (fallThrough === null) return fail("the agent locked instead of falling through to a bridge proposal");
      const partnerGood = state.agents[fallThrough]!.held!.type;
      if (partnerGood === A.want) return fail("the fall-through was another direct want-holder, not a non-direct bridge");
      return pass("the agent excludes the deterministic refuser and falls through to a non-direct bridge proposal");
    },
  },
  {
    id: "B14",
    criterion: "B14 — FIRST_BRIDGE_ACCEPT once per run + payload accuracy",
    claim:
      "FIRST_BRIDGE_ACCEPT fires at most once per run, on the first completed trade in which a party acquires a " +
      "good that is not its current want; its payload names every qualifying party with the correct role, " +
      "acquired good, and qualification label (proposer via bridge-targeted acquisition; accepter via " +
      "tally-clause acceptance), per §10/D-028. Evaluated distributionally (H2).",
    evaluate: (): AssertionResult => {
      const seeds = deriveSeeds(STRUCTURAL_SEED, DEFAULT_BATCH_SIZE);
      let runsWithEvent = 0;
      for (const seed of seeds) {
        const r = run(smallContrastFixture(), seed);
        const fbaIdx = r.events.findIndex((e) => e.type === "FIRST_BRIDGE_ACCEPT");
        const extra = r.events.filter((e) => e.type === "FIRST_BRIDGE_ACCEPT").length;
        if (extra > 1) return fail(`seed ${seed}: FIRST_BRIDGE_ACCEPT fired ${extra} times (at most once per run)`);
        if (fbaIdx < 0) continue;
        runsWithEvent++;
        const fba = r.events[fbaIdx]!;
        const trade = r.events[fbaIdx - 1];
        if (fba.type !== "FIRST_BRIDGE_ACCEPT") return fail(`seed ${seed}: internal — event mistyped`);
        // It is emitted immediately after the qualifying completed trade in its round.
        if (!trade || trade.type !== "TRADE" || trade.round !== fba.round) {
          return fail(`seed ${seed}: FIRST_BRIDGE_ACCEPT was not emitted on a completed trade in its own round`);
        }
        if (fba.qualifiers.length === 0) return fail(`seed ${seed}: FIRST_BRIDGE_ACCEPT payload names no qualifying party`);
        for (const q of fba.qualifiers) {
          if (q.role === "proposer") {
            if (q.party !== trade.proposer || q.acquiredGood !== trade.goodFromPartner || q.qualification !== "bridge-targeted acquisition") {
              return fail(`seed ${seed}: proposer qualifier does not match the trade (party/acquiredGood/qualification)`);
            }
          } else if (q.role === "accepter") {
            if (q.party !== trade.partner || q.acquiredGood !== trade.goodFromProposer || q.qualification !== "tally-clause acceptance") {
              return fail(`seed ${seed}: accepter qualifier does not match the trade (party/acquiredGood/qualification)`);
            }
          } else {
            return fail(`seed ${seed}: FIRST_BRIDGE_ACCEPT carries an unknown qualifier role`);
          }
        }
        // If an accepter qualified, this is the FIRST viaBridge trade of the run.
        if (fba.qualifiers.some((q) => q.role === "accepter")) {
          const firstViaBridge = r.events.findIndex((e) => e.type === "TRADE" && e.viaBridge);
          if (firstViaBridge !== fbaIdx - 1) {
            return fail(`seed ${seed}: an accepter-qualified FIRST_BRIDGE_ACCEPT was not on the run's first via-bridge trade`);
          }
        }
      }
      if (runsWithEvent === 0) return fail("no run produced a FIRST_BRIDGE_ACCEPT; the criterion is untested");
      return pass(
        `FIRST_BRIDGE_ACCEPT fired at most once per run with a §10/D-028-accurate payload across ${seeds.length} seeds (${runsWithEvent} runs emitted it)`,
        { runsWithEvent },
      );
    },
  },
];

// --- C. Round legibility -------------------------------------------------

const C: Assertion[] = [
  campaignCriterion(
    "C0",
    "C0 — Feasibility gate",
    "Before any surface work, the C-series legibility bar is demonstrated reachable for every planned " +
      "teaching round at candidate parameters. If effect-size tuning cannot reach it, the DESIGN of what is " +
      "graded changes (e.g. predict a distribution over a visible batch) — the bar does not move.",
  ),
  ...(["C1", "C2", "C3", "C4", "C5"] as const).map((id) => {
    const round: Record<string, string> = {
      C1: "desirability (the three want-share levels)",
      C2: "recognizability (the three fake-probability levels)",
      C3: "durability (the three spoilage-schedule levels)",
      C4: "divisibility (the three size classes)",
      C5: "portability, at a configuration where distance matters (the stated larger/scaled map)",
    };
    return campaignCriterion(
      id,
      `${id} — ${round[id]!.split(" (")[0]!} round`,
      `In the ${round[id]} round, at teaching parameters with all non-focal properties held identical, the ` +
        "favored good finishes with the top acceptance share in at least the registered fraction of runs, by " +
        "a margin a learner can read off the chart. A round where the predicted winner loses to noise teaches " +
        "the opposite of the lesson.",
    );
  }),
];

// --- D. Synthesis and convergence ---------------------------------------

const D: Assertion[] = [
  campaignCriterion("D1", "D1 — Convergence happens",
    "In the synthesis configuration (four mixed-profile goods), one good's acceptance share reaches the " +
      "registered threshold within the registered round budget in at least the registered fraction of runs."),
  campaignCriterion("D2", "D2 — Convergence is right",
    "The good with the designed-best overall profile wins in at least the registered fraction of converged " +
      "runs; occasional designed losses are honest path-dependence and the rate is bounded."),
  campaignCriterion("D3", "D3 — The loop is visible, and it is growth",
    "Two clauses: (a) the winner's acceptance-share curve shows self-reinforcement — growth accelerating " +
      "after an inflection — and (b) most of the winner-vs-runner-up separation at dominance comes from the " +
      "winner RISING above its own seeded level, not from a seeded head start plus the runner-up's decline."),
  campaignCriterion("D4", "D4 — Time budget",
    "Convergence at teaching parameters completes within a watchable round count (tens of rounds, not " +
      "thousands) under the witnessed-signal constraint, with wall-clock per stage measured in seconds and " +
      "units recorded."),
  {
    id: "D5.headroom",
    criterion: "D5 — Seed headroom (opening frame below dominance)",
    claim:
      "On the structural fixtures this assertion runs, every good's seeded tally level sits below the dominance " +
      "threshold by at least the registered D5_MARGIN — no seeded prior, anywhere a chart can open, already " +
      "shows the answer. The headroom holds by CONSTRUCTION: load validation rejects any config with SEED_CAP > " +
      "DOM_THRESHOLD - D5_MARGIN (G7), and this checks the realized priors honor it. The campaign-grade D5 — the " +
      "same headroom across every teaching/synthesis/scaled configuration, plus the companion winner-rises-above-" +
      "seed clause — is a D-series measurement (C0), not these fixtures' non-canonical constants (D3/D-023).",
    evaluate: (): AssertionResult => {
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        const ceiling = cfg.constants.DOM_THRESHOLD - cfg.constants.D5_MARGIN;
        if (cfg.constants.SEED_CAP > ceiling + 1e-12) {
          return fail(`${f.name}: SEED_CAP ${cfg.constants.SEED_CAP} exceeds DOM_THRESHOLD - D5_MARGIN (${ceiling})`);
        }
        const state = createState(cfg, STRUCTURAL_SEED);
        runSetup(state);
        for (const a of state.agents) {
          for (const p of a.prior) {
            // Score from prior alone (zero events) = K*p/(0+K) = p; it must sit at
            // least D5_MARGIN below the dominance threshold.
            if (p > ceiling + 1e-12) return fail(`${f.name}: a seeded prior ${p} sits within D5_MARGIN of the dominance threshold`);
          }
        }
      }
      return pass("on the structural fixtures it runs, every seeded prior honors the registered D5_MARGIN headroom below the dominance threshold");
    },
  },
  {
    id: "D6",
    criterion: "D6 — Display unity",
    claim:
      "The quantity the chart plots is the SAME statistic as the witnessed-event record: independently " +
      "recomputing the acceptance share from the engine's own event stream (the union of distinct in-window " +
      "events, age-decayed) reproduces the telemetry acceptance share exactly, round for round. There is one " +
      "statistic, not a chart number computed apart from the evidence.",
    evaluate: (): AssertionResult => {
      let checked = 0;
      for (const f of structuralFixtures()) {
        const r = run(f.config, STRUCTURAL_SEED);
        const window = f.config.constants.WINDOW_ROUNDS;
        const decay = f.config.constants.DECAY_FACTOR;
        const gc = f.config.goods.length;

        // Independent per-round distinct-event buckets from the event log.
        const pos = new Map<number, number[]>();
        const tot = new Map<number, number[]>();
        const at = (m: Map<number, number[]>, round: number) => {
          let a = m.get(round);
          if (!a) { a = new Array<number>(gc).fill(0); m.set(round, a); }
          return a;
        };
        for (const e of r.events) {
          if (e.type === "TRADE") {
            at(pos, e.round)[e.goodFromProposer]!++; at(tot, e.round)[e.goodFromProposer]!++;
            at(pos, e.round)[e.goodFromPartner]!++; at(tot, e.round)[e.goodFromPartner]!++;
          } else if (e.type === "REFUSAL") {
            at(tot, e.round)[e.offeredGood]!++;
          } else if (e.type === "FAKE_REVEAL" || e.type === "SPOIL_DESTROY") {
            at(tot, e.round)[e.good]!++;
          }
        }

        for (const t of r.telemetry) {
          for (let g = 0; g < gc; g++) {
            let dPos = 0, dTot = 0, w = 1;
            for (let age = 0; age < window; age++) {
              const rr = t.round - age;
              if (rr < 1) break;
              dPos += (pos.get(rr)?.[g] ?? 0) * w;
              dTot += (tot.get(rr)?.[g] ?? 0) * w;
              w *= decay;
            }
            const expected = dTot > 0 ? dPos / dTot : NO_EVIDENCE;
            const got = t.acceptanceShare[g]!;
            checked++;
            if (expected === NO_EVIDENCE) {
              if (got !== NO_EVIDENCE) return fail(`${f.name} round ${t.round} good ${g}: chart ${got} but the record has no in-window evidence`);
            } else if (got === NO_EVIDENCE || Math.abs(got - expected) > 1e-9) {
              return fail(`${f.name} round ${t.round} good ${g}: chart ${got} != event-record recomputation ${expected}`);
            }
          }
        }
      }
      return pass(`the chart statistic equals an independent recomputation from the event record (${checked} values)`, { checked });
    },
  },
  {
    id: "D7",
    criterion: "D7 — Dominance requires evidence",
    claim:
      "The dominance verdict never fires for a good lacking live trade evidence: a good with zero in-window " +
      "trades is never crowned, however clean its (negative-only) record. Verified directly on the single " +
      "perishable good, which is defined entirely by spoilage and never trades. (The full positive case — the " +
      "trade-floor and rise clauses gating a real DOMINANCE — is pinned in the detector unit tests, M4.)",
    evaluate: (): AssertionResult => {
      // The sole perishable good accrues only SPOIL_DESTROY evidence: zero trades.
      const r = run(structuralFixtures().find((f) => /degenerate/.test(f.name))!.config, STRUCTURAL_SEED);
      const trades = r.events.filter((e) => e.type === "TRADE").length;
      const dominance = r.events.filter((e) => e.type === "DOMINANCE").length;
      if (trades !== 0) return fail("the single-good fixture unexpectedly produced trades");
      if (dominance !== 0) return fail("a good with zero in-window trades was crowned dominant");
      return pass("a good with zero in-window trade evidence is never crowned dominant (the D7 trade floor bites)");
    },
  },
  {
    id: "D7.tradeFloor",
    criterion: "D7 — Dominance requires evidence (per-capita trade floor)",
    claim:
      "A good can meet the acceptance-share threshold, the gap, and the rise and STILL not be crowned when its " +
      "in-window TRADE events fall below the per-capita floor (DOM_MIN_TRADE_SHARE x N). A good that trades once " +
      "and then coasts on the absence of negative evidence is never money. Lifted into the named acceptance " +
      "battery from the detector unit tests (V-38).",
    evaluate: (): AssertionResult => {
      const cfg = detectorControlConfig();
      const W = 1;
      const floor = cfg.constants.DOM_MIN_TRADE_SHARE * cfg.ringSize; // per-capita: x N
      // Run DOM_SUSTAIN high rounds for good 0 with a given in-window trade count;
      // round 1 seeds a LOW first-defined A so the rise clause is satisfied later.
      const crownedWithTrades = (trade: number): number => {
        const state = createState(cfg, STRUCTURAL_SEED);
        const g0 = state.goodStats[0]!;
        const g1 = state.goodStats[1]!;
        setDetectorBucket(g0, 1, W, 0, 1, trade); setDetectorBucket(g1, 1, W, 1, 10, 0); stepStatistics(state, 1, []);
        for (const r of [2, 3, 4]) { setDetectorBucket(g0, r, W, 9, 10, trade); setDetectorBucket(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
        return dominanceCount(state.events, 0);
      };
      if (crownedWithTrades(0) !== 0) return fail("a good below the per-capita trade floor was crowned dominant");
      if (crownedWithTrades(Math.ceil(floor)) === 0) return fail("a good meeting all four clauses including the trade floor was not crowned");
      return pass(`the per-capita trade floor (DOM_MIN_TRADE_SHARE x N = ${floor}) gates dominance: below it never crowned, at it crowned`);
    },
  },
  {
    id: "D7.rise",
    criterion: "D7 — Dominance requires evidence (rise above first value)",
    claim:
      "A good whose acceptance share at detection has not risen above its FIRST defined value of the run by " +
      "DOM_RISE_MIN is never crowned — a line that opens at the ceiling never 'rose,' so a seeded head start " +
      "cannot masquerade as emergence. Lifted into the named acceptance battery from the detector unit tests " +
      "(V-38).",
    evaluate: (): AssertionResult => {
      const cfg = detectorControlConfig();
      const W = 1;
      // Opens high (first-defined A ~ 0.9) and stays high: rise == 0 -> never crowned,
      // though threshold, gap and trade floor all hold every round.
      const opensHigh = (): number => {
        const state = createState(cfg, STRUCTURAL_SEED);
        const g0 = state.goodStats[0]!;
        const g1 = state.goodStats[1]!;
        for (const r of [1, 2, 3, 4]) { setDetectorBucket(g0, r, W, 9, 10, 6); setDetectorBucket(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
        return dominanceCount(state.events, 0);
      };
      // Opens low and rises to the same high level: rise satisfied -> crowned.
      const risesFromLow = (): number => {
        const state = createState(cfg, STRUCTURAL_SEED);
        const g0 = state.goodStats[0]!;
        const g1 = state.goodStats[1]!;
        setDetectorBucket(g0, 1, W, 0, 1, 6); setDetectorBucket(g1, 1, W, 1, 10, 0); stepStatistics(state, 1, []);
        for (const r of [2, 3, 4]) { setDetectorBucket(g0, r, W, 9, 10, 6); setDetectorBucket(g1, r, W, 1, 10, 0); stepStatistics(state, r, []); }
        return dominanceCount(state.events, 0);
      };
      if (opensHigh() !== 0) return fail("a good that opened at the ceiling (zero rise) was crowned dominant");
      if (risesFromLow() === 0) return fail("a good that rose from a low first value to dominance was not crowned");
      return pass("the rise clause gates dominance: opening at the ceiling never 'rose' and is not crowned; rising from a low first value is");
    },
  },
  {
    id: "D8",
    criterion: "D8 — Dominance event semantics",
    claim:
      "Dominance is unique per round (at most one DOMINANCE event in any single round) and non-terminal (it may " +
      "lapse and re-fire, and several goods may fire across a run — so multiple DOMINANCE events across rounds " +
      "are permitted, not an error). CAP_REACHED fires at the cap IFF no DOMINANCE event fired in the run (a " +
      "has-dominated predicate), and equals reachedCap. The run result carries NO scalar dominant-good field; " +
      "any end-state winner is read from the DOMINANCE stream, with which it agrees by construction (D-040/V-20). " +
      "Evaluated distributionally (H2).",
    evaluate: (): AssertionResult => {
      const seeds = deriveSeeds(STRUCTURAL_SEED, DEFAULT_BATCH_SIZE);
      const invariantHeld: boolean[] = [];
      for (const seed of seeds) {
        const r = run(smallContrastFixture(), seed);
        // No scalar dominant-good field on the result (D-040).
        if ("dominantGood" in (r as object)) return fail(`seed ${seed}: the run result carries a scalar dominantGood field (D-040 forbids it)`);
        // Per-round uniqueness: at most one DOMINANCE event in any single round.
        const perRound = new Map<number, number>();
        for (const e of r.events) if (e.type === "DOMINANCE") perRound.set(e.round, (perRound.get(e.round) ?? 0) + 1);
        for (const [round, count] of perRound) {
          if (count > 1) return fail(`seed ${seed} round ${round}: ${count} DOMINANCE events in one round (per-round uniqueness violated)`);
        }
        // CAP_REACHED <-> no DOMINANCE <-> reachedCap.
        const anyDominance = r.events.some((e) => e.type === "DOMINANCE");
        const caps = r.events.filter((e) => e.type === "CAP_REACHED").length;
        if (caps > 1) return fail(`seed ${seed}: ${caps} CAP_REACHED events (at most one per run)`);
        const capFired = caps === 1;
        if (capFired !== !anyDominance) return fail(`seed ${seed}: CAP_REACHED (${capFired}) != no-DOMINANCE-in-run (${!anyDominance})`);
        if (r.reachedCap !== capFired) return fail(`seed ${seed}: reachedCap (${r.reachedCap}) != CAP_REACHED fired (${capFired})`);
        invariantHeld.push(true);
      }
      const rate = passRate(invariantHeld);
      return pass(
        `across ${seeds.length} seeds: per-round DOMINANCE uniqueness holds, CAP_REACHED <-> no-DOMINANCE <-> reachedCap (${rate.hits}/${rate.total}), and no result carries a scalar dominant good`,
        { seeds: seeds.length },
      );
    },
  },
];

// --- E. Scaling and regional behavior -----------------------------------

// The E-series grades the C5 scaled regional/merge behavior on the calibrated bars
// (D-073), filled by the C5 calibration (c5-calibration.ts) at the teaching cell
// (N=16 round-robin, REGION_COUNT 4) per the H6 headroom rule (D-057(a)). Every
// merge / emergence determination runs through the ROBUST born-dominance measure
// over the GLOBAL A(g) telemetry (D-069/D-072) — never the engine's §9.2
// DOMINANT(g)/DOMINANCE event. Each bar is graded two-sidedly: the teaching cell
// must still CLEAR it (a regression guard against the ratified C0-filled number),
// and a cited regime where the mechanic is DISABLED must still FAIL it (the C4
// lesson — a bar nothing can fail proves nothing). Distributional, 50-seed
// batches (H2).
const E: Assertion[] = [
  {
    id: "E1",
    criterion: "E1 — Regional moneys form",
    claim:
      "At scale parameters with local information, at least two distinct regional leaders appear at some point " +
      "before global convergence in at least the registered fraction of runs — graded on the C5 teaching cell " +
      `(N=${C5_TEACHING_N} round-robin, REGION_COUNT 4; D-073) against the C0-filled bar ${E1_BAR} (H6 headroom, ` +
      "D-057(a)). Regional leadership is the weak per-region leader (greatest per-region A(g), no rise clause, " +
      "D-072 unaffected), read from telemetry. FAILABLE by construction: in the single-region ablation " +
      "(REGION_COUNT 1, otherwise identical geometry) the engine tracks no regional leaders at all, so the rate " +
      "collapses to 0 — without that collapse the bar would grade nothing.",
    evaluate: (): AssertionResult => {
      const teach = runScaledCell(c5TeachingConfig()).e1FormRate;
      const ablation = runScaledCell(c5FailE1Config()).e1FormRate;
      if (ablation >= E1_BAR) {
        return fail(`single-region ablation E1 rate ${ablation.toFixed(3)} did not fall below the bar ${E1_BAR}: regional formation is not what the bar grades (not failable)`);
      }
      if (teach < E1_BAR) {
        return fail(`teaching-cell E1 regional-formation rate ${teach.toFixed(3)} fell below the C0-filled bar ${E1_BAR}`);
      }
      return pass(
        `≥2 regional moneys form before convergence in ${teach.toFixed(3)} of teaching-cell runs (bar ${E1_BAR}); the single-region ablation collapses to ${ablation.toFixed(3)} (failable)`,
        { rate: teach },
      );
    },
  },
  {
    id: "E2",
    criterion: "E2 — Regions merge",
    claim:
      "After regional leaders form, the market still reaches global convergence in at least the registered " +
      `fraction of runs — graded on the C5 teaching cell against the C0-filled bar ${E2_BAR} (H6, D-057(a)). A ` +
      "merge counts only when the convergence winner EMERGED (robust born-dominance over global A(g), D-072) " +
      "rather than being born dominant — a born-dominant 'convergence' is fiat, not a merge — and the winner is " +
      "recomputed harness-side from the A(g) telemetry, never read from the DOMINANCE event. FAILABLE: under " +
      "regional-clustered placement the reach geometry fragments into regional moneys that never merge (the " +
      "D-073 finding), so the rate collapses below the bar.",
    evaluate: (): AssertionResult => {
      const teach = runScaledCell(c5TeachingConfig()).e2MergeRate;
      const clustered = runScaledCell(c5FailE2Config()).e2MergeRate;
      if (clustered >= E2_BAR) {
        return fail(`regional-clustered E2 merge rate ${clustered.toFixed(3)} did not fall below the bar ${E2_BAR}: the merge regime is not what the bar grades (not failable)`);
      }
      if (teach < E2_BAR) {
        return fail(`teaching-cell E2 merge rate ${teach.toFixed(3)} fell below the C0-filled bar ${E2_BAR}`);
      }
      return pass(
        `regions merge via an emerged winner (robust, no DOMINANCE read) in ${teach.toFixed(3)} of teaching-cell runs (bar ${E2_BAR}); clustered placement fragments to ${clustered.toFixed(3)} (failable)`,
        { rate: teach },
      );
    },
  },
  {
    id: "E3",
    criterion: "E3 — Portability decides the merge",
    claim:
      "In scaled runs where a low-portability good leads one region and a high-portability good leads another, " +
      "the high-portability good wins the merge in at least the registered fraction of cases — directional, over " +
      `the conditioning set where the lead-config holds, graded against the C0-filled bar ${E3_BAR} (H6, ` +
      `D-057(a)), which sits above the ~${E3_CHANCE_BASELINE.toFixed(2)} three-good chance. The winner is the ` +
      "robust convergence winner over global A(g) that also EMERGED (D-072), never the DOMINANCE event. FAILABLE: " +
      `at N=${C5_FAIL_E3_N} round-robin the merge is too weak for portability to decide it, so the directional ` +
      "rate collapses below the bar.",
    evaluate: (): AssertionResult => {
      const teach = runScaledCell(c5TeachingConfig()).e3DecidesRate;
      const weak = runScaledCell(c5FailE3Config()).e3DecidesRate;
      if (!(E3_BAR > E3_CHANCE_BASELINE)) {
        return fail(`the E3 bar ${E3_BAR} does not exceed the ${E3_CHANCE_BASELINE.toFixed(3)} three-good chance baseline — it grades no portability signal`);
      }
      if (weak >= E3_BAR) {
        return fail(`N=${C5_FAIL_E3_N} round-robin E3 rate ${weak.toFixed(3)} did not fall below the bar ${E3_BAR}: portability deciding the merge is not what the bar grades (not failable)`);
      }
      if (teach < E3_BAR) {
        return fail(`teaching-cell E3 portability-decides rate ${teach.toFixed(3)} fell below the C0-filled bar ${E3_BAR}`);
      }
      return pass(
        `the high-portability good wins+emerges the merge in ${teach.toFixed(3)} of conditioning runs (bar ${E3_BAR} > ${E3_CHANCE_BASELINE.toFixed(2)} chance); collapses to ${weak.toFixed(3)} at N=${C5_FAIL_E3_N} (failable)`,
        { rate: teach },
      );
    },
  },
];

// --- F. Opening beats ----------------------------------------------------

const F: Assertion[] = [
  campaignCriterion("F1", "F1 — Barter visibly fails",
    "In the direct-exchange opening configuration the scripted second want has no direct partner by " +
      "construction, and free-trade direct-trade success per round stays at or below the registered ceiling " +
      "while remaining nonzero."),
  campaignCriterion("F2", "F2 — Indirect exchange visibly works",
    "The same configuration with the intermediary path available reaches the learner's goal within the " +
      "registered round budget."),
];

// --- G. Robustness and degenerate inputs --------------------------------

const G: Assertion[] = [
  campaignCriterion("G1", "G1 — Maxed good wins",
    "A sandbox good with every property at its best setting beats the standard field decisively in at least " +
      "the registered fraction of runs."),
  {
    id: "G2",
    criterion: "G2 — Degenerate settings don't crash",
    claim:
      "A degenerate market — here a single-good world, where every agent's want support is empty after homeGood " +
      "exclusion (want = NONE) and no trade can occur — runs to its round limit without error and resolves to a " +
      "defined no-convergence outcome, never crashing or coercing a winner. Evaluated over a seed batch (H2), " +
      "not a single run.",
    evaluate: (): AssertionResult => {
      const cfg = singleGoodPerishableFixture(); // the want = NONE single-good degenerate (V-36)
      const seeds = deriveSeeds(STRUCTURAL_SEED, DEFAULT_BATCH_SIZE);
      for (const seed of seeds) {
        let r;
        try {
          r = run(cfg, seed);
        } catch (e) {
          return fail(`single-good degenerate threw at seed ${seed} instead of running to the cap: ${(e as Error).message}`);
        }
        if (r.telemetry.length !== cfg.constants.ROUND_CAP) return fail(`seed ${seed}: did not run to its round cap`);
        if (r.events.some((e) => e.type === "DOMINANCE")) return fail(`seed ${seed}: coerced a winner in a degenerate market`);
        if (!r.reachedCap) return fail(`seed ${seed}: no defined no-convergence outcome (reachedCap not set)`);
      }
      return pass(`the single-good (want=NONE) degenerate ran to the cap with a defined no-convergence outcome across ${seeds.length} seeds`, { seeds: seeds.length });
    },
  },
  {
    id: "G3",
    criterion: "G3 — No-convergence is a defined outcome",
    claim:
      "A run that reaches the round limit without a dominance verdict reports that state explicitly — it emits " +
      "CAP_REACHED exactly once and records reachedCap — and is never dressed up as a weak win. Evaluated " +
      "distributionally (H2): across a seed batch every run resolves to exactly one of {converged, capped}, and " +
      "the capped runs are the explicitly-flagged no-convergence outcome.",
    evaluate: (): AssertionResult => {
      const seeds = deriveSeeds(STRUCTURAL_SEED, DEFAULT_BATCH_SIZE);

      // (a) The single-good degenerate always reaches the cap: CAP_REACHED is the
      //     defined no-convergence outcome, demonstrated across the batch.
      const degen = singleGoodPerishableFixture();
      for (const seed of seeds) {
        const r = run(degen, seed);
        const caps = r.events.filter((e) => e.type === "CAP_REACHED").length;
        if (caps !== 1 || !r.reachedCap || r.events.some((e) => e.type === "DOMINANCE")) {
          return fail(`single-good seed ${seed}: expected one CAP_REACHED + reachedCap + no DOMINANCE (caps=${caps}, reachedCap=${r.reachedCap})`);
        }
      }

      // (b) A real two-focal market splits between converging and capping across
      //     seeds; EVERY run is cleanly classified, and the capped runs are flagged.
      //     smallContrast is NOT frozen — it converges in a minority of seeds — so
      //     this reports the actual split and drops the false "never converges"
      //     claim (V-14/V-36).
      const market = smallContrastFixture();
      let converged = 0;
      let capped = 0;
      for (const seed of seeds) {
        const r = run(market, seed);
        const dominated = r.events.some((e) => e.type === "DOMINANCE");
        const caps = r.events.filter((e) => e.type === "CAP_REACHED").length;
        if (dominated && caps === 0 && !r.reachedCap) { converged++; continue; }
        if (!dominated && caps === 1 && r.reachedCap) { capped++; continue; }
        return fail(`market seed ${seed}: neither cleanly converged nor cleanly capped (dominated=${dominated}, caps=${caps}, reachedCap=${r.reachedCap})`);
      }
      if (converged + capped !== seeds.length) return fail("a run was classified as both or neither outcome");
      if (capped === 0) return fail("no run reached the cap; the no-convergence outcome was never exercised in the batch");
      return pass(`across ${seeds.length} seeds every run is cleanly converged-xor-capped (${converged} converged, ${capped} capped); CAP_REACHED is a first-class flagged outcome`, { converged, capped });
    },
  },
  {
    id: "G4",
    criterion: "G4 — Bounded across the controls (D7 trade-floor denomination)",
    claim:
      "The D7 live-evidence floor is denominated correctly across the control range, not in raw event counts " +
      "(B10): it is per-capita (DOM_MIN_TRADE_SHARE x N, so it scales with the population control), and the " +
      "in-window TRADE count spans WINDOW_ROUNDS (so the effective per-round bar scales with the window, V-17). " +
      "B10's static table audit cannot catch this base-mixing; this dynamic check does. The concrete " +
      "non-convergence-rate bar at the tuned control extremes is a C0 measurement (V-23).",
    evaluate: (): AssertionResult => {
      // (a) Per-capita: the SAME in-window trade count is crowned at a small N and
      //     rejected at a larger N, because the floor is DOM_MIN_TRADE_SHARE x N. A
      //     raw-count floor could not flip the verdict on N alone.
      const W1 = 1;
      const crownedAtN = (n: number, trade: number): number => {
        const cfg = detectorConfigN(n, W1);
        const state = createState(cfg, STRUCTURAL_SEED);
        const g0 = state.goodStats[0]!;
        const g1 = state.goodStats[1]!;
        setDetectorBucket(g0, 1, W1, 0, 1, trade); setDetectorBucket(g1, 1, W1, 1, 10, 0); stepStatistics(state, 1, []);
        for (const r of [2, 3, 4]) { setDetectorBucket(g0, r, W1, 9, 10, trade); setDetectorBucket(g1, r, W1, 1, 10, 0); stepStatistics(state, r, []); }
        return dominanceCount(state.events, 0);
      };
      // N=6 -> floor 0.6; one trade clears it -> crowned. N=20 -> floor 2.0; one
      // trade does NOT clear it -> not crowned. Same trade count, verdict flips on N.
      if (crownedAtN(6, 1) === 0) return fail("a good clearing the per-capita floor at small N was not crowned");
      if (crownedAtN(20, 1) !== 0) return fail("the floor did not scale with N — a raw-count floor would crown the same good at large N (B10 base-mixing)");

      // (b) Window-spanning: at N=20 (floor 2.0) one trade PER ROUND clears the
      //     floor only once the window spans >= 2 rounds, so its in-window count
      //     accumulates to 2. The effective per-round bar scales with WINDOW_ROUNDS.
      const crownedWithWindow = (window: number): number => {
        const cfg = detectorConfigN(20, window);
        const state = createState(cfg, STRUCTURAL_SEED);
        const g0 = state.goodStats[0]!;
        const g1 = state.goodStats[1]!;
        for (let r = 1; r <= 6; r++) {
          const pos = r === 1 ? 0 : 9;
          const tot = r === 1 ? 1 : 10;
          setDetectorBucket(g0, r, window, pos, tot, 1); setDetectorBucket(g1, r, window, 1, 10, 0);
          stepStatistics(state, r, []);
        }
        return dominanceCount(state.events, 0);
      };
      if (crownedWithWindow(1) !== 0) return fail("with a 1-round window, one trade/round (1 < floor 2.0) wrongly crowned a good");
      if (crownedWithWindow(2) === 0) return fail("with a 2-round window, the in-window count (2 >= floor 2.0) should clear the floor and crown");
      return pass("the D7 floor is per-capita (scales with N) and window-spanning (in-window count spans WINDOW_ROUNDS); concrete control-extreme bar set at C0");
    },
  },
  campaignCriterion("G5", "G5 — Near-identical inputs get honest verdicts",
    "A configuration is 'too close to call' when its winner distribution over a QA batch is contested past " +
      "the registered threshold; coin-flip markets never receive confident causal verdicts, and the harness " +
      "supplies the contestedness mechanism rather than asserting the property with nothing behind it."),
  {
    id: "G6",
    criterion: "G6 — Every number is defined",
    claim:
      "Every acceptance share the engine reports is, for every round to the cap and across all supported " +
      "configurations, either an explicit NO_EVIDENCE (the zero-evidence case) or a finite number — never NaN, " +
      "Infinity, or an arbitrary coerced value.",
    evaluate: (): AssertionResult => {
      let checked = 0;
      for (const f of structuralFixtures()) {
        const r = run(f.config, STRUCTURAL_SEED);
        for (const t of r.telemetry) {
          for (const v of Object.values(t.acceptanceShare)) {
            checked++;
            if (v !== NO_EVIDENCE && !Number.isFinite(v)) {
              return fail(`${f.name} round ${t.round}: a statistic was ${v} (not NO_EVIDENCE or finite)`);
            }
          }
        }
      }
      return pass(`every one of ${checked} reported acceptance shares is NO_EVIDENCE or finite`, { checked });
    },
  },
  {
    id: "G7",
    criterion: "G7 — Invalid configs are rejected",
    claim:
      "Load-time validation rejects — never silently normalizes — any configuration violating a registered §2.4 " +
      "validity precondition: focal want-share sum > 1 - FILLER_MIN_SHARE (R-34); SEED_CAP > DOM_THRESHOLD - " +
      "D5_MARGIN (D-016/D-056); DOM_SUSTAIN < 1 (V-05). A valid configuration is accepted unchanged.",
    evaluate: (): AssertionResult => {
      const base = smallContrastFixture();
      try {
        validateConfig(base);
      } catch (e) {
        return fail(`the baseline valid config was rejected: ${(e as Error).message}`);
      }
      // Each must be REJECTED at load (a throw); a silent acceptance is the failure.
      const mustReject = (label: string, cfg: Config): AssertionResult | null => {
        try {
          validateConfig(cfg);
        } catch {
          return null; // rejected as required
        }
        return fail(`${label}: an invalid config was accepted, not rejected at load (silent normalization is forbidden)`);
      };
      const r1 = mustReject("focal want-share sum > 1 - FILLER_MIN_SHARE", { ...base, constants: { ...base.constants, FILLER_MIN_SHARE: 0.95 } });
      if (r1) return r1;
      const r2 = mustReject("SEED_CAP > DOM_THRESHOLD - D5_MARGIN", { ...base, constants: { ...base.constants, SEED_CAP: 0.6 } });
      if (r2) return r2;
      const r3 = mustReject("DOM_SUSTAIN < 1", { ...base, constants: { ...base.constants, DOM_SUSTAIN: 0 } });
      if (r3) return r3;
      return pass("load validation rejects all three §2.4 validity preconditions (want-share ceiling, SEED_CAP/D5_MARGIN headroom, DOM_SUSTAIN >= 1) and accepts a valid config");
    },
  },
];

// --- H. Reproducibility and reporting -----------------------------------

const H: Assertion[] = [
  {
    id: "H1",
    criterion: "H1 — Seeded determinism",
    claim:
      "An identical {seed, configuration} produces an identical run — the same ordered event stream, telemetry, " +
      "and final state — bit-for-bit. Any hidden nondeterminism (unseeded randomness, host APIs, iteration-order " +
      "dependence) would surface here as a divergence.",
    evaluate: (): AssertionResult => {
      for (const f of structuralFixtures()) {
        const a = serializeRun(run(f.config, STRUCTURAL_SEED));
        const b = serializeRun(run(f.config, STRUCTURAL_SEED));
        if (a !== b) {
          let i = 0;
          while (i < a.length && i < b.length && a[i] === b[i]) i++;
          return fail(`${f.name} is non-deterministic; first divergence at char ${i}`);
        }
      }
      return pass(`all ${structuralFixtures().length} fixtures replay identically from a fixed seed`);
    },
  },
  {
    id: "H1.pin",
    criterion: "H1 — PROJECT_SEED pinned trace (D-032)",
    claim:
      "The engine reproduces the pinned PROJECT_SEED reference trace bit-for-bit — by SHA-256 digest and by " +
      "the committed golden bytes. This is the project's pinned deterministic trace: a change to the engine, " +
      "RNG tape, payload schema, emission predicates, detector semantics, or the pinning fixture moves these " +
      "bytes and fails here until a register entry and an explicit re-pin land (D-032).",
    evaluate: (): AssertionResult => {
      const check = verifyPin();
      if (!check.digestMatches) {
        return fail(`PROJECT_SEED trace digest changed: ${check.currentDigest} != pinned ${PINNED_DIGEST} — needs a register entry + re-pin (D-032)`);
      }
      if (!check.goldenMatches) {
        return fail("PROJECT_SEED trace digest matches but the committed golden bytes differ — re-pin the golden file");
      }
      return pass(`engine reproduces the pinned PROJECT_SEED trace exactly (sha256 ${PINNED_DIGEST.slice(0, 12)}...)`);
    },
  },
  {
    id: "H1.purity",
    criterion: "H1/H4 — Engine platform purity (D-011)",
    claim:
      "The engine source uses no implementation-defined transcendental math (exp/pow/log/sin/...), no " +
      "Math.random, and no host APIs (Date, DOM, Node) — the preconditions for the same seed replaying " +
      "bit-for-bit under both V8 and Hermes. Recency decay is a per-round multiplicative factor, never " +
      "exp(-lambda*age).",
    evaluate: (): AssertionResult => {
      const v = auditEnginePurity();
      return v.length === 0
        ? pass("engine source is free of transcendental math, Math.random, and host APIs")
        : fail(
            "platform-purity violations: " +
              v.map((x) => `${x.file}:${x.line} '${x.token}' (${x.why})`).join("; "),
          );
    },
  },
  campaignCriterion("H2", "H2 — Distributional harness",
    "The QA harness runs N-seed batches per configuration and reports distributions (mean, spread, pass-rate " +
      "per criterion), never a single run presented as the result."),
  {
    id: "H3",
    criterion: "H3 — Criteria-version stamp & run record",
    claim:
      "Every run stamps the criteria version it was judged against, and this assertion anchors that stamp on the " +
      "GOVERNING criteria version this battery encodes — not a self-referential equality of the stamp against " +
      "itself, which passes while silently recording a superseded bar (the failure V-18/V-34 caught). If " +
      "CRITERIA_VERSION drifts from the governing version, this fails. The record also carries the seed, the " +
      "engine version, and a canonical integrity hash of the full configuration.",
    evaluate: (): AssertionResult => {
      // The criteria document this battery is written against. It is bumped in
      // lockstep with the criteria adoption (review protocol v1.2 / D-048); this
      // assertion is the backstop that fails if the in-code stamp drifts from it,
      // rather than comparing the stamp to itself (V-18/V-34).
      const GOVERNING_CRITERIA = "criteria-v2.3";
      if (CRITERIA_VERSION !== GOVERNING_CRITERIA) {
        return fail(`CRITERIA_VERSION "${CRITERIA_VERSION}" != the governing criteria this battery encodes ("${GOVERNING_CRITERIA}") — the harness would record a superseded bar`);
      }
      const rec = makeRunRecord(structuralFixtures()[0]!.config, 1231006505);
      if (rec.criteriaVersion !== GOVERNING_CRITERIA) return fail("run record does not stamp the governing criteria version");
      if (rec.engineVersion !== ENGINE_VERSION) return fail("run record does not stamp the engine version");
      if (rec.seed !== 1231006505) return fail("run record does not preserve the seed");
      // The integrity hash (D-042) is canonical: key order does not change it, and
      // materially different configs do not collide. Tested on the hash function
      // directly — its canonicality is independent of the run-record shape.
      const hashA = hashConfig({ mode: "small", ringSize: 10, note: "fixture" });
      const hashAReordered = hashConfig({ note: "fixture", ringSize: 10, mode: "small" });
      const hashB = hashConfig({ mode: "small", ringSize: 11, note: "fixture" });
      if (hashA !== hashAReordered) return fail("config hash changed under key reordering (not canonical)");
      if (hashA === hashB) return fail("config hash collided for materially different configs");
      return pass(`stamp anchored on the governing criteria version (${GOVERNING_CRITERIA}); record carries seed + engine ${ENGINE_VERSION} + full config + canonical integrity hash`);
    },
  },
  {
    id: "H4",
    criterion: "H4 — Learner runs are replayable",
    claim:
      "Every learner-facing run records its seed and its FULL configuration, and replays from that record ALONE " +
      "— no external config supplied. Record-self-sufficiency is the test (D-042): a stored run is re-runnable " +
      "after the fact from what it stored, reproducing the run bit-for-bit. A config hash can only verify a " +
      "configuration you already hold; it cannot reconstruct one for a run pulled from storage, so the record " +
      "carries the configuration itself, the hash only as an integrity field.",
    evaluate: (): AssertionResult => {
      const f = structuralFixtures()[0]!;
      const r = run(f.config, STRUCTURAL_SEED);
      // The record must carry the FULL configuration, not just a hash (D-042).
      if (r.record.config === undefined) return fail("run record carries no configuration — it cannot be replayed from the record alone");
      if (r.record.seed !== STRUCTURAL_SEED) return fail("run record does not preserve the seed");
      if (r.record.engineVersion !== ENGINE_VERSION) return fail("run record does not stamp the engine version");
      if (r.record.criteriaVersion !== CRITERIA_VERSION) return fail("run record does not stamp the criteria version");
      // The hash is an integrity field over the stored config, never the config itself.
      if (r.record.configHash !== hashConfig(r.record.config)) return fail("the record's integrity hash does not match its stored configuration");
      // Replay from the RECORD ALONE — its stored config and seed, no external config object.
      const replay = run(r.record.config, r.record.seed);
      if (serializeRun(r) !== serializeRun(replay)) return fail("replay from the record alone did not reproduce the run");
      return pass("the run replays bit-for-bit from its record alone (full configuration + seed); the record is self-sufficient (L-46 closed)");
    },
  },
  campaignCriterion("H5", "H5 — The acceptance harness asserts",
    "Every machine-checkable criterion in the document is encoded as a machine PASS/FAIL in this harness; no " +
      "acceptance verdict rests on a human comparing printed summaries to a table. (The harness's own ability " +
      "to FAIL is proven by harness/self-test.ts.)"),
  {
    id: "H6",
    criterion: "H6 — Bounds discipline (registry consistency)",
    claim:
      "Every constant is in a self-consistent bounds state: a still-TBD constant carries no smuggled value, " +
      "and any proposed-or-fixed constant carries an actual value. A value with no recorded status is a " +
      "FAIL — bounds ratify targets, they are not back-filled from measurements.",
    evaluate: (): AssertionResult => {
      const offenders: string[] = [];
      for (const c of CONSTANTS) {
        if (c.status === "tbd" && c.proposed !== null) offenders.push(`${c.name} (TBD but carries a value)`);
        if (c.status !== "tbd" && c.proposed === null) offenders.push(`${c.name} (${c.status} but has no value)`);
      }
      return offenders.length === 0
        ? pass(`all ${CONSTANTS.length} constants are in a consistent bounds state`)
        : fail(`bounds-discipline violations: ${offenders.join("; ")}`);
    },
  },
  {
    id: "H7.events",
    criterion: "H7 — No phantom mechanisms (event coverage)",
    claim:
      "Every event type in the spec's vocabulary is emitted by at least one fixture run — no event type ships " +
      "un-exercised (indistinguishable from one that doesn't exist, with full QA green). Any type not reached by " +
      "a fixture must be carried by an explicit, reasoned exemption; silence is the one disallowed state. " +
      "(Decision-rule branch coverage is exercised by the engine self-test's white-box assertions.)",
    evaluate: (): AssertionResult => {
      const vocabulary: readonly string[] = [
        "PRODUCE", "TRADE", "REFUSAL", "SPOIL_STAGE", "SPOIL_DESTROY", "FAKE_REVEAL", "CONSUME",
        "FIRST_BRIDGE_ACCEPT", "LEAD_CHANGE", "REGION_LEADER", "REGIONS_MERGED", "DOMINANCE",
        "CAP_REACHED", "FILLER_PROMOTED", "DECISION_TRACE",
      ];
      // Events covered by a harness assertion or pinned trace rather than a fixture
      // emission would be listed here with a reason. Currently empty: every type is
      // emitted by a structural fixture.
      const exemptions: Readonly<Record<string, string>> = {};

      const emitted = new Set<string>();
      for (const f of structuralFixtures()) {
        for (const e of run(f.config, STRUCTURAL_SEED).events) emitted.add(e.type);
      }
      const uncovered = vocabulary.filter((t) => !emitted.has(t) && !(t in exemptions));
      if (uncovered.length > 0) {
        return fail(`event types reached by no fixture and no exemption (silence is disallowed): ${uncovered.join(", ")}`);
      }
      const exemptCount = Object.keys(exemptions).length;
      return pass(
        `all ${vocabulary.length} event types are exercised (${vocabulary.length - exemptCount} by fixtures, ${exemptCount} exempted)`,
        { eventTypes: vocabulary.length, exemptions: exemptCount },
      );
    },
  },
];

// --- I. Human evidence ---------------------------------------------------

const I: Assertion[] = [
  surfaceCriterion("I1", "I1 — Type floor",
    "No explanatory text renders below the registered minimum pixel size, machine-checked from the shipped CSS."),
  surfaceCriterion("I2", "I2 — Contrast floor",
    "All text meets WCAG AA 4.5:1 against its rendered background, machine-computed from the shipped CSS; no " +
      "'muted' register is exempt."),
  surfaceCriterion("I3", "I3 — No unlabeled instruments",
    "Every rendered surface and instrument has orientation copy present in the string table before it ships; " +
      "shipping a surface 'unworded, awaiting copy' is a FAIL."),
  surfaceCriterion("I4", "I4 — Outcome-aware strings",
    "Every verdict, retrieval, and explainer string templates on the session's ACTUAL outcome; no hardcoded " +
      "winner anywhere."),
  surfaceCriterion("I5", "I5 — No silent mutations",
    "Every change to an agent's held good — trade, spoilage, fake disposal, re-endowment — produces a visible " +
      "trace on at least one learner-facing surface; goods never mutate mysteriously."),
  surfaceCriterion("I6", "I6 — Decision on screen",
    "A required surface shows one agent's single accept/reject decision with its visible inputs — the locus " +
      "of the causal claim is on screen, not deferred to an inspector."),
  surfaceCriterion("I7", "I7 — Early human contact",
    "The first comprehension probe happens at the earliest stage the engine plus a minimal surface can " +
      "support: a session record exists, dated before any surface artifact beyond the registered minimal " +
      "probe surface enters review."),
  surfaceCriterion("I8", "I8 — Testers and records",
    "Each testing round uses at least two target-audience testers and produces a session record (profile, " +
      "instrument, completion point, notes/recording) as a required artifact."),
  surfaceCriterion("I9", "I9 — Mechanism probe",
    "A defined comprehension question verifies the learner can describe, in their own words, what the " +
      "accept/reject decision is and why properties changed outcomes; it is administered every round and its " +
      "result recorded. An unadministered probe is a FAIL."),
  surfaceCriterion("I10", "I10 — Reviewed artifact, identified artifact",
    "No build reaches an external tester without a logged review of the exact artifact, identified by version " +
      "ID and content hash, with the deferred-findings ledger checked."),
  surfaceCriterion("I11", "I11 — Strings render from the authority",
    "Every string on any shipped surface originates from the copy authority, verified by scanning the shipped " +
      "artifact against the string table; inline literals, shadowing duplicates, and dead table entries all fail."),
  surfaceCriterion("I12", "I12 — No stale client state",
    "Persisted client state is keyed to engine and build version; on mismatch it is cleared or migrated by " +
      "explicit rule, never carried silently, and session records include the build hash."),
];

/** The full battery, in document order. */
export function allAssertions(): Assertion[] {
  return [...A, ...B, ...C, ...D, ...E, ...F, ...G, ...H, ...I];
}
