/**
 * C5 SCALED FEASIBILITY (D-063 pending-module build; D-072 measure). EXPLICITLY
 * DIAGNOSTIC: not a registered pass, commits no bar. It shows the E1/E2/E3 scaled
 * statistics (c5-scaled.ts) separate in scaled mode — proof the relocations are
 * reachable, NOT the bars (those are TBD, C0-filled per H6).
 *
 * Scaled C5 geometry (D-057(c)/(f)): three goods differing ONLY in bulk/portability —
 * logs (R_bulky, low port) / firewood (R_medium) / charcoal (R_light, high port) — at
 * reach radii (2, 4, 6) (D-057(c) starting proposal); REGION_COUNT 4 (D-057(d)); ring
 * N in {12, 16} (<= the interim ceiling, D-057). Reach is MUTUAL (min of both held
 * goods' radii, §6.4), so a low-port good is confined to short hops while the high-port
 * good can bridge across regions.
 *
 * THINNESS WATCH (D-057 interim ceiling): N <= 16, REGION_COUNT 4 => ~3-4 traders/region.
 * If regional formation or the merge does not separate because the regions are too thin
 * (high NO_EVIDENCE — the D-058 thinness finding surfacing in scaled mode), that is a
 * finding to REPORT, not tune: it may couple C5 calibration to the measured-ceiling
 * successor (the D-052/D-058 village re-draw that would raise N). This runner does NOT
 * push N or tune to force separation.
 *
 * Self-contained: defines its own scaled config (does not touch the c0 campaign tree).
 * The convergence/merge winner is recomputed harness-side from global A(g) telemetry via
 * the robust D-069/D-072 measure — never the engine DOMINANT(g)/DOMINANCE event.
 * Harness code may use Node/console; the engine stays platform-pure.
 */

import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { scaledOutcome } from "./c5-scaled.ts";
import { buildC5, LOW_PORT, HIGH_PORT } from "./c5-config.ts";

const SEEDS = deriveSeeds(20260608, DEFAULT_BATCH_SIZE); // functional base (D-010); not outcome-shopped

const f = (x: number) => (Number.isNaN(x) ? "  —  " : x.toFixed(3));

console.log("C5 SCALED FEASIBILITY (D-063 module; D-072 robust measure). DIAGNOSTIC ONLY (no pass, no bar).");
console.log("3 goods differ only in portability: logs(R2,low) / firewood(R4) / charcoal(R6,high); REGION_COUNT 4.");
console.log("merge-winner = robust convergence from GLOBAL A(g) telemetry (D-069/D-072), NOT the DOMINANCE event.");
console.log(`thinness watch: N<=16, 4 regions => ~3-4 traders/region; low regionalDefined ⇒ D-058 thinness in scaled mode.\n`);

for (const placement of ["regional-clustered", "round-robin"] as const) {
  console.log(`=== placement: ${placement} ===`);
  console.log("  N   | E1 form | converged | E2 merge | E3 decides (n cond) | regionalDefined (thinness)");
  for (const n of [12, 16]) {
    const runs = SEEDS.map((s) => run(buildC5(n, placement), s));
    const o = scaledOutcome(runs, LOW_PORT, HIGH_PORT);
    console.log(
      `  ${String(n).padEnd(3)} |  ${f(o.e1FormRate)}  |   ${f(o.convergedRate)}   |  ${f(o.e2MergeRate)}   |  ${f(o.e3DecidesRate)} (n=${o.e3ConditioningRuns})        |  ${f(o.regionalDefinedRate)}`,
    );
  }
  console.log("");
}
console.log("Reading: E1 = >=2 regional leaders before convergence; E2 = converged via an EMERGED winner (robust);");
console.log("E3 = of runs where low-port leads one region & high-port another, the fraction the high-port good wins+emerged.");
console.log("Bars (pass-rate %, margins) are TBD — C0-filled per H6. Separation here is reachability evidence, not the bar.");
