/**
 * Resolved-topology self-test (D-064).
 *
 * Asserts the additive `RunResult.initialTopology` block the engine emits so a
 * consumer can render the desirability-round geometry from the engine's own
 * resolution instead of recomputing it (D-053): per-good resolved reach and
 * per-trader region membership. Each value is recomputed here INDEPENDENTLY from
 * the configuration — reach from the `LevelMapping.reachRadius` table, region
 * from the equal-arc floor formula — rather than by calling the engine's
 * `reachOf` / `regionOf`, so this is a genuine cross-check of the resolution and
 * not a function compared against itself.
 *
 * It lives outside `engines/` deliberately: the platform-purity audit
 * (harness/purity.ts) scans every `.ts` under `engines/` and forbids host
 * imports, and a self-test is not engine source. It also stays out of `harness/`.
 * It uses only `console` and a local throwing `check` — no host module imports —
 * so it carries no dependency the engine itself could not.
 *
 * Seeds here are functional test seeds (D-010): plain numbers chosen to run the
 * engine, never for any outcome. The topology block is a pure function of
 * {config, positions} and is seed-independent, but the block is read off a real
 * `run()` so the test exercises the actual emission path.
 *
 * Run via `npm run selftest:topology`. Any failure throws and exits non-zero.
 */

import { run } from "../engines/emergence/index.ts";
import {
  smallContrastFixture,
  tradingPairFixture,
  scaledFixture,
  singleGoodPerishableFixture,
  pinningFixture,
} from "../engines/emergence/fixtures.ts";
import type { Config } from "../engines/emergence/types.ts";

let checks = 0;
function check(cond: boolean, label: string): void {
  checks++;
  if (!cond) throw new Error(`TOPOLOGY SELF-TEST FAILED: ${label}`);
}

const FUNCTIONAL_SEED = 24681; // arbitrary; the block is seed-independent.

/**
 * The engine's resolved region count: REGION_COUNT in scaled mode, else 1
 * (engines/emergence/state.ts). Recomputed here so the expected partition is
 * derived independently of the engine's own value.
 */
function expectedRegionCount(config: Config): number {
  return config.mode === "scaled" ? config.constants.REGION_COUNT : 1;
}

function checkFixture(name: string, config: Config): void {
  const r = run(config, FUNCTIONAL_SEED);
  const t = r.initialTopology;

  check(t !== undefined && t !== null, `${name}: initialTopology block is present`);

  // (a) Resolved reach per good — independent recomputation from the mapping table.
  check(t.reachByGood.length === config.goods.length, `${name}: reachByGood has one entry per good`);
  for (const g of config.goods) {
    const expected = config.mapping.reachRadius[g.attributes.portability];
    check(
      t.reachByGood[g.id] === expected,
      `${name}: good ${g.id} resolved reach ${t.reachByGood[g.id]} must equal reachRadius[portability ${g.attributes.portability}] = ${expected}`,
    );
  }

  // (b) Region membership per trader — independent recomputation of the equal arcs.
  const rc = expectedRegionCount(config);
  const arc = config.ringSize / rc;
  check(t.regionsPartition === rc > 1, `${name}: regionsPartition reflects whether the ring is split (${rc} regions)`);
  check(t.regionByTrader.length === config.ringSize, `${name}: regionByTrader has one entry per ring position`);
  for (let pos = 0; pos < config.ringSize; pos++) {
    const expected = Math.floor(pos / arc);
    check(
      t.regionByTrader[pos] === expected,
      `${name}: trader at position ${pos} resolved region ${t.regionByTrader[pos]} must equal floor(${pos}/${arc}) = ${expected}`,
    );
    check(
      t.regionByTrader[pos]! >= 0 && t.regionByTrader[pos]! < rc,
      `${name}: region index ${t.regionByTrader[pos]} is within [0, ${rc})`,
    );
  }
  if (rc <= 1) {
    check(
      t.regionByTrader.every((x) => x === 0),
      `${name}: a single-region ring resolves every trader to the explicit single-region value 0`,
    );
  }

  // (c) Indexing invariant the block depends on: `regionByTrader` is indexed by
  // ring position, and the agent at finalAgents index i sits at ring position i
  // (positions are fixed for the run). This is what lets a consumer join the block
  // to finalAgents. Positions are NOT duplicated in the block — finalAgents stays
  // their single source — so we assert the alignment rather than block-vs-agent equality.
  check(r.finalAgents.length === config.ringSize, `${name}: one final agent per ring position`);
  for (let i = 0; i < r.finalAgents.length; i++) {
    check(r.finalAgents[i]!.position === i, `${name}: finalAgents[${i}].position === ${i} (ring-position indexing holds)`);
  }
}

checkFixture("smallContrast (single-region small)", smallContrastFixture());
checkFixture("tradingPair (single-region live)", tradingPairFixture());
checkFixture("scaled (two-region partition)", scaledFixture());
checkFixture("singleGoodPerishable (one good, one region)", singleGoodPerishableFixture());
checkFixture("pinning (pinned scaled fixture)", pinningFixture());

console.log(`topology self-test OK — ${checks} checks passed (D-064 initialTopology: reach-per-good, region-per-trader).`);
