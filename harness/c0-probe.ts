/**
 * C0 DIAGNOSTIC PROBE (D-058 follow-up) — lever power vs market thinness.
 * EXPLICITLY DIAGNOSTIC: not a registered pass, commits no verdict. It removes the
 * freeze (the few-good liquid regime where the C1 control already converged:
 * 3 focal + 1 filler = 4 goods) and asks, per beat, whether the favored good tops
 * the focal trio reliably (>=0.90 round / >=0.85 C2 ordering) at the REGISTERED
 * lever, only at a WIDENED lever, or not even then. That sorts each beat:
 *   - thinness-only   : passes at liquid + registered lever (fix = liquidity)
 *   - lever-underpowered: passes only at liquid + widened lever (fix = a D-057
 *                         successor sweep expansion)
 *   - round-design    : fails even at liquid + widened lever (the C0 escape fires)
 *
 * The liquid regime and the widened levers are diagnostic constructions, not
 * registered values; nothing here is a C0 cell or a committed result.
 */

import type { LevelMapping, RunResult } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { passRate } from "./stats.ts";
import {
  buildVillage,
  VILLAGE_BEATS,
  C0_MAPPING_VILLAGE,
  C0_CONSTANTS_VILLAGE,
  favoredTopsTrioRun,
  roundFocalPassRun,
  orderingPassRun,
  type VillageBeat,
} from "./c0.ts";

const SEEDS = deriveSeeds(20260608, DEFAULT_BATCH_SIZE);
const LIQUID_FILLER = 1; // 3 focal + 1 filler = 4 goods: the few-good regime that removed the freeze
const N = 12;

/** Widened-lever mappings per beat (diagnostic only — wider than D-057's grid). C4 has no continuous lever. */
const WIDEN: Record<string, ((m: LevelMapping) => LevelMapping) | null> = {
  // want-share spread 0.08/0.15/0.30 -> 0.05/0.15/0.50 (focal sum 0.70 <= 0.75).
  C1: (m) => ({ ...m, wantShareWeight: [0.05, 0.15, 0.5] }),
  // fast-spoil 2,2 -> 1,1 (destroyed at age 2): a starker durability gap vs never-spoils.
  C3: (m) => ({ ...m, durabilitySchedule: [{ s1: 1, s2: 1, neverSpoils: false }, m.durabilitySchedule[1]!, m.durabilitySchedule[2]!] }),
  // divisibility is structural (whole/coarse/fine already the extremes) — no wider lever.
  C4: null,
  // f_high 0.25 -> 0.45: more fakes on the worst-recognizability good.
  C2: (m) => ({ ...m, fakeProbability: [0.45, 0.1, 0.0] }),
};

function measure(beat: VillageBeat, mapping: LevelMapping) {
  const cfg = buildVillage(beat, N, LIQUID_FILLER, mapping, C0_CONSTANTS_VILLAGE);
  const rs: RunResult[] = SEEDS.map((s) => run(cfg, s));
  const ordering = beat.grade === "ordering";
  const pass = passRate(rs.map(ordering ? orderingPassRun : roundFocalPassRun)).rate;
  const trio = passRate(rs.map(favoredTopsTrioRun)).rate;
  let trades = 0;
  let refusals = 0;
  const aSum = [0, 0, 0];
  const aCnt = [0, 0, 0];
  for (const r of rs) {
    for (const e of r.events) {
      if (e.type === "TRADE") trades++;
      else if (e.type === "REFUSAL") refusals++;
    }
    const last = r.telemetry[r.telemetry.length - 1]!;
    for (let g = 0; g < 3; g++) {
      const v = last.acceptanceShare[g];
      if (v !== null && v !== undefined) { aSum[g]! += v; aCnt[g]!++; }
    }
  }
  return {
    pass, trio,
    tradesPerRun: trades / rs.length,
    accRate: trades / (trades + refusals),
    aMean: aSum.map((s, g) => (aCnt[g]! ? s / aCnt[g]! : 0)) as [number, number, number],
  };
}

const f = (x: number) => x.toFixed(3);
console.log("C0 DIAGNOSTIC PROBE — lever vs thinness, at a liquid (4-good) config. NOT a registered pass.");
console.log(`liquid regime: ${N} agents, 3 focal + ${LIQUID_FILLER} filler, registered constants; bar = 0.90 round / 0.85 C2 ordering`);
console.log("");

for (const beat of VILLAGE_BEATS) {
  const bar = beat.grade === "ordering" ? 0.85 : 0.9;
  const reg = measure(beat, C0_MAPPING_VILLAGE);
  const widenFn = WIDEN[beat.id];
  const wide = widenFn ? measure(beat, widenFn(C0_MAPPING_VILLAGE)) : null;

  let cls: string;
  if (reg.pass >= bar) cls = "THINNESS-ONLY (passes at liquid + registered lever -> fix is liquidity)";
  else if (wide && wide.pass >= bar) cls = "LEVER-UNDERPOWERED (passes only at liquid + widened lever -> D-057-successor sweep expansion)";
  else if (!widenFn) cls = "ROUND-DESIGN? (no continuous lever to widen; fails at liquid + the structurally-maximal lever -> escape candidate)";
  else cls = "ROUND-DESIGN (fails even at liquid + widened lever -> the C0 escape fires)";

  console.log(`=== ${beat.id} (${beat.focal}, ${beat.grade}) ===`);
  console.log(`  registered lever: pass=${f(reg.pass)} topsTrio=${f(reg.trio)}  | trades/run=${reg.tradesPerRun.toFixed(0)} acc=${f(reg.accRate)} | focal A[worst,mid,best]=[${reg.aMean.map(f).join(", ")}]`);
  if (wide) console.log(`  widened lever:    pass=${f(wide.pass)} topsTrio=${f(wide.trio)}  | trades/run=${wide.tradesPerRun.toFixed(0)} acc=${f(wide.accRate)} | focal A[worst,mid,best]=[${wide.aMean.map(f).join(", ")}]`);
  else console.log("  widened lever:    (none — divisibility size classes are structural extremes)");
  console.log(`  => ${cls}`);
  console.log("");
}
