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
import { auditEnginePurity } from "./purity.ts";

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
    "With acceptance-tally learning frozen after seeding and wants pinned to their initial draw, " +
      "convergence must degrade by at least the registered minimum. If the market still converges at " +
      "full strength, the convergence was baked into the static demand structure, not produced by the " +
      "acceptance dynamics the simulation claims to demonstrate.",
  ),
  engineCriterion(
    "A2",
    "A2 — Mechanic ablation, per property",
    "For each property with a mechanical effect (durability, recognizability, divisibility, portability, " +
      "scarcity): disabling the mechanic while leaving the displayed level set must make that level have " +
      "zero measurable effect on outcomes. Properties act ONLY through their named mechanics; no hidden " +
      "score reads a property level directly.",
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
  engineCriterion(
    "A6.composition",
    "A6 — Witnessable inputs only (event-record composition)",
    "Instrumented over a run, 100% of the tally's event record traces to witnessable events. The seeded " +
      "prior is not an event, never enters the event record, and is excluded from this audit.",
  ),
  engineCriterion(
    "A6.prior",
    "A6 — Seeded-prior initialization assertion",
    "Every agent's seeded prior equals the registered initialization formula exactly (capped local " +
      "want-share), checked directly rather than inferred from behavior.",
  ),
  campaignCriterion(
    "A7",
    "A7 — No categorical fiat (monotonic across levels)",
    "Stepping a single attribute from its worst to its best level, all else held identical, produces a " +
      "monotonically non-decreasing focal-good win rate, with every step's effect arriving through event " +
      "dynamics — never a floor, threshold, or category rule. A perishable loses because spoilage events " +
      "destroy its candidacy, not because a rule disqualifies it before events can answer.",
  ),
  engineCriterion(
    "A8",
    "A8 — Same label, same mechanics (relabel-equivariance)",
    "Two goods with identical level profiles are mechanically identical: relabeling them (with the matching " +
      "permutation of homeGoods and wants) at a fixed seed yields the identical event stream up to the " +
      "relabeling. No per-good adjustment exists beneath any label.",
  ),
  engineCriterion(
    "A9",
    "A9 — The trace is the computation",
    "An independent referee reproduces every accept/reject verdict from the decision trace's listed inputs " +
      "alone, and those inputs contain only events, states, tallies, and registered gates. The trace IS the " +
      "computation, not a decoration of a verdict it cannot derive.",
  ),
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
  engineCriterion(
    "B11",
    "B11 — Semantic event stream",
    "Every teachable moment emits a typed, consumable event; narration binds only to event types and " +
      "predicates over them, never to specific rounds, agent identities, or facts of one trace. Over a batch " +
      "of live runs, every beat fires from events and no beat asserts a trace fact.",
  ),
  engineCriterion(
    "B12",
    "B12 — Conservation closes",
    "For every round and every good type: instances at start + entering = instances at end + exiting, " +
      "accounted per named channel, with the setup endowment charged to the production channel and zero " +
      "unexplained deltas over any full run. The engine neither leaks nor mints instances outside named channels.",
  ),
  engineCriterion(
    "B13",
    "B13 — No permanent refusal-lock",
    "Where an agent's want is held by a reachable partner whose refusal is deterministic, the agent emits at " +
      "least one non-direct (bridge) proposal within the rolling-window length in rounds. The executed freeze " +
      "of the prior design fails this by name.",
  ),
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
  engineCriterion("D5", "D5 — Seed headroom",
    "Across ALL supported configurations including minimal-neighborhood cases, every good's seeded tally " +
      "level sits below the dominance threshold by the registered margin, and the winner's level at dominance " +
      "exceeds its seeded level by the registered minimum. The opening chart never already shows the answer."),
  engineCriterion("D6", "D6 — Display unity",
    "The quantity the learner's chart plots, the quantity the dominance detector tests, and the witnessed " +
      "event record are the SAME statistic. Any holdings/stock view is never offered as evidence of the winner, " +
      "and the honest flow telemetry is a permanent engine output the harness asserts on."),
  engineCriterion("D7", "D7 — Dominance requires evidence",
    "The dominance verdict never fires for a good with fewer in-window trade events than the registered " +
      "per-capita floor, and never for a good whose acceptance share has not risen above its first defined " +
      "value of the run by the registered minimum. A good that trades once and coasts is never crowned."),
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
  engineCriterion("G2", "G2 — Degenerate settings don't crash",
    "All-worst, all-identical, demand-concentrated, and single-good markets run to the round limit without " +
      "error and present a defined 'no convergence' outcome rather than crashing or coercing a winner."),
  engineCriterion("G3", "G3 — No-convergence is a defined outcome",
    "A run hitting the round limit without meeting the convergence threshold reports that state explicitly " +
      "(CAP_REACHED) and is never displayed as a weak win."),
  campaignCriterion("G4", "G4 — Bounded across the controls",
    "Non-convergence rate stays at or below the registered ceiling across the ENTIRE range of every " +
      "learner-exposed control (population, speed, good count) — not only at defaults."),
  campaignCriterion("G5", "G5 — Near-identical inputs get honest verdicts",
    "A configuration is 'too close to call' when its winner distribution over a QA batch is contested past " +
      "the registered threshold; coin-flip markets never receive confident causal verdicts, and the harness " +
      "supplies the contestedness mechanism rather than asserting the property with nothing behind it."),
  engineCriterion("G6", "G6 — Every number is defined",
    "Every statistic read by any decision rule, detector, or grading surface is a defined finite value for " +
      "every round to the cap across all supported configurations, including zero-evidence windows, where the " +
      "no-evidence case has an explicit specified behavior (NO_EVIDENCE) rather than an arbitrary number."),
];

// --- H. Reproducibility and reporting -----------------------------------

const H: Assertion[] = [
  engineCriterion("H1", "H1 — Seeded determinism",
    "Identical seed + configuration produces an identical run, bit-for-bit, across sessions."),
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
      const cfgA = { mode: "small", ringSize: 10, note: "fixture" };
      const cfgAReordered = { note: "fixture", ringSize: 10, mode: "small" };
      const cfgB = { mode: "small", ringSize: 11, note: "fixture" };
      const recA = makeRunRecord(cfgA, 1231006505);
      const recAReordered = makeRunRecord(cfgAReordered, 1231006505);
      const recB = makeRunRecord(cfgB, 1231006505);
      if (recA.criteriaVersion !== CRITERIA_VERSION) return fail("run record does not stamp the criteria version");
      if (recA.engineVersion !== ENGINE_VERSION) return fail("run record does not stamp the engine version");
      if (recA.seed !== 1231006505) return fail("run record does not preserve the seed");
      if (recA.configHash !== recAReordered.configHash) {
        return fail("config hash changed under key reordering (not canonical)");
      }
      if (recA.configHash === recB.configHash) {
        return fail("config hash collided for materially different configs");
      }
      return pass(`run record stamps {seed, configHash, engine=${ENGINE_VERSION}, criteria=${CRITERIA_VERSION}} and the hash is canonical`);
    },
  },
  engineCriterion("H4", "H4 — Learner runs are replayable",
    "Every learner-facing run, sandbox included, records its seed and full configuration and can be replayed " +
      "exactly; every outcome a grading surface judges is re-runnable after the fact."),
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
  engineCriterion("H7", "H7 — No phantom mechanisms",
    "Every decision-rule branch and every event type in the spec is exercised by at least one harness " +
      "assertion or pinned functional trace. A mechanism no test reaches is indistinguishable from one that " +
      "does not exist, with full QA green — and is a FAIL here."),
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
