/**
 * C0 DIAGNOSTIC — flow re-grade + synthesis/decomposition. EXPLICITLY DIAGNOSTIC,
 * nothing committed. Both at the liquid 4-good config (3 focal + 1 filler, N=12).
 *
 * (1) Flow re-grade: per-good circulation (TRADE moves, derived from the event
 *     stream — the §9.3 changing-hands quantity; the telemetry FlowCounts is
 *     aggregate, so it is counted per good here). Does the durable/recognizable
 *     good lead on flow where it trailed on the acceptance fraction A(g), or
 *     trail on flow too?
 * (2) Synthesis (all-best good) + decomposition: does the favored good win on
 *     A(g) AND flow when it is best on everything? And with desirability held
 *     NEUTRAL (no demand lever), does varying only durability — or only
 *     recognizability — still produce a win, or is every win desirability-driven?
 */

import type { Config, GoodType, RunResult, AcceptanceShare } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { passRate } from "./stats.ts";
import { buildVillage, VILLAGE_BEATS, C0_MAPPING_VILLAGE, C0_CONSTANTS_VILLAGE } from "./c0.ts";

const SEEDS = deriveSeeds(20260608, DEFAULT_BATCH_SIZE);
type P = [number, number, number, number, number, number]; // des,dur,rec,div,por,sca

function mkGood(id: number, label: string, isFiller: boolean, p: P): GoodType {
  return {
    id, label, isFiller,
    attributes: { desirability: p[0] as 0 | 1 | 2, durability: p[1] as 0 | 1 | 2, recognizability: p[2] as 0 | 1 | 2, divisibility: p[3] as 0 | 1 | 2, portability: p[4] as 0 | 1 | 2, scarcity: p[5] as 0 | 1 | 2 },
  };
}

/** Config from explicit focal profiles + one all-middle filler (the liquid regime). */
function buildCustom(focal: [P, P, P]): Config {
  const goods: GoodType[] = focal.map((p, i) => mkGood(i, `focal-${["worst", "mid", "best"][i]}`, false, p));
  goods.push(mkGood(3, "filler", true, [1, 1, 1, 1, 1, 1]));
  const g = goods.length;
  return {
    mode: "synthesis", ablation: { kind: "none" }, ringSize: 12, goods, focalGoodIds: [0, 1, 2],
    mapping: C0_MAPPING_VILLAGE, productionPolicy: "profession",
    homeGoods: Array.from({ length: 12 }, (_, i) => i % g), constants: C0_CONSTANTS_VILLAGE,
  };
}

const asNum = (v: AcceptanceShare | undefined) => (v === null || v === undefined ? -1 : v);

function analyze(cfg: Config) {
  const rs: RunResult[] = SEEDS.map((s) => run(cfg, s));
  const aMean = [0, 0, 0];
  const aCnt = [0, 0, 0];
  const flowMean = [0, 0, 0];
  const aTops: boolean[] = [];
  const flowTops: boolean[] = [];
  let trades = 0;
  let refusals = 0;
  for (const r of rs) {
    const last = r.telemetry[r.telemetry.length - 1]!;
    const a = [asNum(last.acceptanceShare[0]), asNum(last.acceptanceShare[1]), asNum(last.acceptanceShare[2])];
    for (let g = 0; g < 3; g++) if (a[g]! >= 0) { aMean[g]! += a[g]!; aCnt[g]!++; }
    aTops.push(a[2]! > a[1]! && a[2]! > a[0]!);
    const flow = [0, 0, 0];
    for (const e of r.events) {
      if (e.type === "TRADE") {
        trades++;
        if (e.goodFromProposer < 3) flow[e.goodFromProposer]!++;
        if (e.goodFromPartner < 3) flow[e.goodFromPartner]!++;
      } else if (e.type === "REFUSAL") refusals++;
    }
    for (let g = 0; g < 3; g++) flowMean[g]! += flow[g]!;
    flowTops.push(flow[2]! > flow[1]! && flow[2]! > flow[0]!);
  }
  return {
    aMean: aMean.map((s, g) => (aCnt[g]! ? s / aCnt[g]! : 0)) as number[],
    flowMean: flowMean.map((s) => s / rs.length) as number[],
    aTopsRate: passRate(aTops).rate,
    flowTopsRate: passRate(flowTops).rate,
    tradesPerRun: trades / rs.length,
    acc: trades / (trades + refusals),
  };
}

const f = (x: number) => x.toFixed(3);
function line(label: string, cfg: Config) {
  const m = analyze(cfg);
  console.log(`${label.padEnd(34)} A[w,m,b]=[${m.aMean.map(f).join(",")}] favTopsA=${f(m.aTopsRate)} | flow[w,m,b]=[${m.flowMean.map((x) => x.toFixed(0)).join(",")}] favTopsFlow=${f(m.flowTopsRate)} | trades/run=${m.tradesPerRun.toFixed(0)} acc=${f(m.acc)}`);
}

console.log("=== (1) FLOW RE-GRADE — does the favored good lead on circulation, not just A(g)? (liquid 4-good) ===");
for (const beat of VILLAGE_BEATS) {
  if (beat.id === "C1") continue; // C1 already leads on A; the question is C3/C2/C4
  line(`${beat.id} (${beat.focal})`, buildVillage(beat, 12, 1, C0_MAPPING_VILLAGE, C0_CONSTANTS_VILLAGE));
}

console.log("\n=== (2) SYNTHESIS + DECOMPOSITION (favored = good 'best', id 2) ===");
const NEUTRAL_DIVPOR_SCA: [number, number, number] = [2, 2, 1]; // div, por, sca held neutral/locked
// Synthesis: good 2 best on EVERYTHING.
line("synthesis: all-best vs all-mid/worst", buildCustom([
  [0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 1],
]));
// Decomposition — desirability NEUTRAL (1) for all (equal demand), vary ONE non-demand lever.
line("desirability-only (dur/rec/div/por neutral)", buildCustom([
  [0, 2, 2, 2, 2, 1], [1, 2, 2, 2, 2, 1], [2, 2, 2, 2, 2, 1], // only desirability varies (control: the working lever)
]));
line("durability-only (desirability neutral)", buildCustom([
  [1, 0, 2, ...NEUTRAL_DIVPOR_SCA], [1, 1, 2, ...NEUTRAL_DIVPOR_SCA], [1, 2, 2, ...NEUTRAL_DIVPOR_SCA],
]));
line("recognizability-only (desirability neutral)", buildCustom([
  [1, 2, 0, ...NEUTRAL_DIVPOR_SCA], [1, 2, 1, ...NEUTRAL_DIVPOR_SCA], [1, 2, 2, ...NEUTRAL_DIVPOR_SCA],
]));
console.log("\n(favTopsA / favTopsFlow are the rate the favored good tops the focal trio; random ~ 0.33)");
