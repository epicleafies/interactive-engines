/**
 * Built-vs-source determinism gate (consumable-packaging workstream).
 *
 * The PROJECT_SEED pin (harness/project-seed-pin.ts) proves the SOURCE engine
 * reproduces PINNED_DIGEST. This gate proves the same of the BUILT, packaged
 * engine: it imports `run` through the package's public entry — `import { run }
 * from "interactive-engines"`, which the `exports` map resolves to the emitted
 * `dist/` JS — and asserts that running the pinning fixture on PROJECT_SEED and
 * serializing it with the SAME canonical serializer yields the SAME digest.
 *
 * This is the guard that the build step (specifier rewriting, declaration
 * emission, the .ts->.js transform) did not perturb engine behavior, and — run
 * after Workstream A — the joint guard that the additive `initialTopology` block
 * did not move the digest. Built run() vs source serializer vs pinned digest: if
 * any drift, this throws.
 *
 * It lives in packaging/ (outside the tsconfig `include` and the `test` script)
 * so it never couples the existing tsx-based typecheck/harness/selftest/test
 * paths to a prior build. It is reached only through `npm run verify:packaged`,
 * which builds first. `tsconfig.packaging.json` typechecks it against the built
 * declarations, which is also the proof that the package entry resolves and is
 * typed.
 */

import { createHash } from "node:crypto";
import { run } from "interactive-engines"; // the BUILT entry, via the exports map
import { serializeRun } from "../harness/engine-adapter.ts";
import { pinningFixture } from "../engines/emergence/fixtures.ts";
import { PROJECT_SEED } from "../harness/project-seed.ts";
import { PINNED_DIGEST } from "../harness/project-seed-pin.ts";

function fail(msg: string): never {
  throw new Error(`BUILT-VS-SOURCE PIN GATE FAILED: ${msg}`);
}

const result = run(pinningFixture(), PROJECT_SEED);
const trace = serializeRun(result);
const builtDigest = createHash("sha256").update(trace).digest("hex");

if (builtDigest !== PINNED_DIGEST) {
  fail(`built engine digest ${builtDigest} != PINNED_DIGEST ${PINNED_DIGEST}`);
}

// The packaged engine must also carry the D-064 additive block (it is emitted by
// run(), excluded from the serialized digest). Its presence here is the built
// confirmation that the additive output ships without moving the digest.
const topo = result.initialTopology;
if (topo === undefined || topo === null) fail("built RunResult is missing initialTopology (D-064)");
if (topo.reachByGood.length !== pinningFixture().goods.length) {
  fail("built initialTopology.reachByGood is not one-per-good");
}
if (topo.regionByTrader.length !== pinningFixture().ringSize) {
  fail("built initialTopology.regionByTrader is not one-per-trader");
}

console.log(
  `built-vs-source pin gate OK — packaged run() reproduces PINNED_DIGEST ${PINNED_DIGEST.slice(0, 12)}... ` +
    `on PROJECT_SEED, and emits the D-064 initialTopology block (digest-neutral).`,
);
