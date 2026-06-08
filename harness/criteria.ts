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

import type { Assertion, AssertionResult, HarnessContext } from "./assert.ts";
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
  createState,
  runSetup,
  runToInternalState,
  selectPartner,
} from "./engine-adapter.ts";
import { NO_EVIDENCE } from "../engines/emergence/types.ts";
import { refereeVerdict } from "./referee.ts";
import { verifyPin, PINNED_DIGEST } from "./project-seed-pin.ts";

/**
 * A functional seed for the engine-backed structural criteria — an arbitrary
 * fixed number chosen to exercise the engine, not for any outcome (D-010). The
 * PROJECT_SEED pinned trace is a separate, dedicated assertion.
 */
const STRUCTURAL_SEED = 20260607;

// --- Stage reasons -------------------------------------------------------

const ENGINE_PENDING =
  "reference engine not yet implemented (build-order step 2, gated on register rulings A-D)";
const CAMPAIGN_PENDING =
  "requires a tuned campaign configuration; tuned TBD constants unfilled (H6) and the engine is pending";
const SURFACE_PENDING =
  "requires a learner-facing surface, which does not exist yet (build-order steps 6-7)";

/** A criterion whose check is wired in once the reference engine exists. */
function engineCriterion(id: string, criterion: string, claim: string): Assertion {
  return {
    id,
    criterion,
    claim,
    evaluate: (ctx: HarnessContext): AssertionResult =>
      ctx.engine === undefined ? pending(ENGINE_PENDING) : pending("engine present but this check is not yet wired"),
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
  engineCriterion(
    "A3",
    "A3 — No global knowledge",
    "In local-information mode, no agent decision reads state outside its own neighborhood: an event " +
      "outside an agent's witness radius cannot change that agent's behavior until the information " +
      "propagates through trades and observations.",
  ),
  engineCriterion(
    "A4",
    "A4 — Seeding honesty",
    "Acceptance tallies initialize from visible wants only; no tally is pre-seeded with the intended " +
      "winner. The seeded prior is a function of the agent's visible neighbors' wants and a registered cap " +
      "alone.",
  ),
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
  engineCriterion(
    "B2.staleTrade",
    "B2 — No completed trade leaves a stale non-want held",
    "Stale goods are refused as bridge acquisitions by all agents while remaining acceptable as direct " +
      "wants; the invariant asserted over a run is that no completed trade ever leaves any party holding a " +
      "stale instance of a type other than its current want.",
  ),
  engineCriterion(
    "B3",
    "B3 — Recognizability reveal & exit accounting",
    "Fakes reveal only after acquisition, with the loss landing on the accepter, who writes a negative tally " +
      "entry weighted heavier than a mere observation. Every instance created fake exits via an exit event " +
      "and never as a satisfied want; per-channel telemetry attributes fake exits exactly, so a fake lost to " +
      "spoilage before discovery still counts in the fake ledger.",
  ),
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
  engineCriterion(
    "B6",
    "B6 — Desirability isolation",
    "Changing a focal good's desirability reallocates want-share only against background filler goods; the " +
      "other focal goods' want-shares stay fixed within tolerance, so a pairwise comparison is not moved by a " +
      "third good's dial.",
  ),
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
      "Across all supported configurations, every good's seeded tally level sits strictly below the dominance " +
      "threshold — no seeded prior, anywhere a chart can open, already shows the answer. (The companion clause, " +
      "the winner rising above its seed at dominance, is a convergence/campaign measurement.)",
    evaluate: (): AssertionResult => {
      for (const f of structuralFixtures()) {
        const cfg = f.config;
        if (cfg.constants.SEED_CAP >= cfg.constants.DOM_THRESHOLD) {
          return fail(`${f.name}: SEED_CAP ${cfg.constants.SEED_CAP} is not below DOM_THRESHOLD ${cfg.constants.DOM_THRESHOLD}`);
        }
        const state = createState(cfg, STRUCTURAL_SEED);
        runSetup(state);
        for (const a of state.agents) {
          for (const p of a.prior) {
            // score from prior alone (zero events) = K*p/(0+K) = p; must be below threshold.
            if (p >= cfg.constants.DOM_THRESHOLD) return fail(`${f.name}: a seeded prior ${p} reaches the dominance threshold`);
          }
        }
      }
      return pass("every seeded prior sits strictly below the dominance threshold across all fixtures");
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
];

// --- E. Scaling and regional behavior -----------------------------------

const E: Assertion[] = [
  campaignCriterion("E1", "E1 — Regional moneys form",
    "At scale parameters with local information, at least two distinct regional leaders appear at some point " +
      "before global convergence in at least the registered fraction of runs."),
  campaignCriterion("E2", "E2 — Regions merge",
    "After regional leaders form, the market still reaches global convergence (scaled thresholds) in at " +
      "least the registered fraction of runs."),
  campaignCriterion("E3", "E3 — Portability decides the merge",
    "In scaled runs where a low-portability good leads one region and a high-portability good leads another, " +
      "the high-portability good wins the merge in at least the registered fraction of cases."),
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
      "Degenerate markets — a single good, or an all-refusal frozen market — run to the round limit without " +
      "error and present a defined 'no convergence' outcome, rather than crashing or coercing a winner.",
    evaluate: (): AssertionResult => {
      // The single-good and frozen fixtures are the degenerate cases reachable today.
      const degenerate = structuralFixtures().filter((f) => /degenerate|frozen/.test(f.name));
      for (const f of degenerate) {
        let r;
        try {
          r = run(f.config, STRUCTURAL_SEED);
        } catch (e) {
          return fail(`${f.name} threw instead of running to the cap: ${(e as Error).message}`);
        }
        if (r.telemetry.length !== f.config.constants.ROUND_CAP) {
          return fail(`${f.name} did not run to its round cap`);
        }
        // Authority is the DOMINANCE event stream, not a scalar field (D-040).
        if (r.events.some((e) => e.type === "DOMINANCE")) return fail(`${f.name} coerced a winner in a degenerate market`);
      }
      return pass(`${degenerate.length} degenerate fixtures ran to the cap with a defined no-convergence outcome`);
    },
  },
  {
    id: "G3",
    criterion: "G3 — No-convergence is a defined outcome",
    claim:
      "A run that reaches the round limit without a dominance verdict reports that state explicitly — it emits " +
      "CAP_REACHED, records reachedCap, and names no dominant good — and is never dressed up as a weak win.",
    evaluate: (): AssertionResult => {
      const r = run(structuralFixtures().find((f) => /frozen/.test(f.name))!.config, STRUCTURAL_SEED);
      // No DOMINANCE event ever fired — the run named no dominant good (D-040).
      if (r.events.some((e) => e.type === "DOMINANCE")) return fail("the frozen fixture unexpectedly converged");
      const capEvents = r.events.filter((e) => e.type === "CAP_REACHED").length;
      if (capEvents !== 1) return fail(`expected exactly one CAP_REACHED, saw ${capEvents}`);
      if (!r.reachedCap) return fail("reachedCap was not set on a non-converging run");
      return pass("the non-converging run emits CAP_REACHED once and records reachedCap with no dominant good");
    },
  },
  campaignCriterion("G4", "G4 — Bounded across the controls",
    "Non-convergence rate stays at or below the registered ceiling across the ENTIRE range of every " +
      "learner-exposed control (population, speed, good count) — not only at defaults."),
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
      "Every run records the four things needed to adjudicate it later — its seed, a hash of its full " +
      "configuration, the engine version, and the criteria version it is judged against — so a disputed " +
      "number can always be re-derived against the right bar.",
    evaluate: (): AssertionResult => {
      // The version/seed stamp is recorded for every run, from a real config.
      const rec = makeRunRecord(structuralFixtures()[0]!.config, 1231006505);
      if (rec.criteriaVersion !== CRITERIA_VERSION) return fail("run record does not stamp the criteria version");
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
      return pass(`run record stamps {seed, full config + integrity hash, engine=${ENGINE_VERSION}, criteria=${CRITERIA_VERSION}} and the hash is canonical`);
    },
  },
  {
    id: "H4",
    criterion: "H4 — Learner runs are replayable",
    claim:
      "Every run records the four things needed to reproduce it after the fact — its seed, a hash of its full " +
      "configuration, the engine version, and the criteria version — and re-running from that record reproduces " +
      "the run exactly. No outcome a grading surface judges is ever unexaminable.",
    evaluate: (): AssertionResult => {
      const f = structuralFixtures()[0]!;
      const r = run(f.config, STRUCTURAL_SEED);
      if (r.record.seed !== STRUCTURAL_SEED) return fail("run record does not preserve the seed");
      if (!r.record.configHash) return fail("run record carries no config hash");
      if (r.record.engineVersion !== ENGINE_VERSION) return fail("run record does not stamp the engine version");
      if (r.record.criteriaVersion !== CRITERIA_VERSION) return fail("run record does not stamp the criteria version");
      const replay = run(f.config, r.record.seed);
      if (serializeRun(r) !== serializeRun(replay)) return fail("replay from the recorded seed did not reproduce the run");
      return pass("the run record carries {seed, configHash, engineVersion, criteriaVersion} and replays exactly");
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
