/**
 * Harness self-test.
 *
 * Criteria H5 is emphatic: "a harness that cannot fail is not a harness." This
 * script proves the instrument works before any engine output is trusted to it:
 * the PRNG is deterministic and platform-stable, the assertion framework
 * actually produces FAIL (and rolls a FAIL up to a REJECT verdict), the
 * distributional helpers compute what they claim, the config hash is canonical,
 * and the determinism check localizes a divergence.
 *
 * Run via `npm run selftest`. Any failure throws and the process exits non-zero.
 */

import { makeRng } from "./prng.ts";
import { fail, pass, type Assertion, type HarnessContext } from "./assert.ts";
import { summarize as summarizeReport, evaluateAll } from "./report.ts";
import { passRate, summarize as summarizeStats } from "./stats.ts";
import { hashConfig } from "./hash.ts";
import { checkDeterminism } from "./replay.ts";
import { deriveSeeds } from "./batch.ts";

let checks = 0;
function check(cond: boolean, label: string): void {
  checks++;
  if (!cond) throw new Error(`SELF-TEST FAILED: ${label}`);
}

// 1. PRNG determinism, range, and reseeding.
{
  const a = makeRng(12345);
  const b = makeRng(12345);
  const seqA: number[] = [];
  const seqB: number[] = [];
  for (let i = 0; i < 1000; i++) {
    seqA.push(a.nextFloat());
    seqB.push(b.nextFloat());
  }
  check(seqA.every((x, i) => x === seqB[i]), "same seed must produce identical sequences");
  check(seqA.every((x) => x >= 0 && x < 1), "nextFloat must stay in [0,1)");

  const c = makeRng(54321);
  check(c.nextFloat() !== seqA[0], "different seeds should diverge");

  const d = makeRng(7);
  for (let n = 1; n <= 16; n++) {
    const v = d.nextInt(n);
    check(Number.isInteger(v) && v >= 0 && v < n, `nextInt(${n}) must land in [0,${n})`);
  }
}

// 2. Mulberry32 known-answer vector (regression pin).
//    Seed 7 is an arbitrary fixed value chosen only to pin the algorithm's
//    output; it is NOT a story-shopped seed and carries no engine meaning. If
//    these first draws ever change, the PRNG (and therefore every replay) changed.
{
  const r = makeRng(7);
  const first = [r.nextFloat(), r.nextFloat(), r.nextFloat()];
  // Values recomputed from the mulberry32 definition in prng.ts.
  const expected = [0.011704753153026104, 0.06195825757458806, 0.97690763277933];
  for (let i = 0; i < expected.length; i++) {
    check(Math.abs(first[i]! - expected[i]!) < 1e-15, `mulberry32(7) draw ${i} regression`);
  }
}

// 3. The assertion framework can FAIL, and a FAIL rolls up to a REJECT verdict.
{
  const passing: Assertion = {
    id: "selftest.pass",
    criterion: "self-test",
    claim: "always passes",
    evaluate: () => pass("ok"),
  };
  const failing: Assertion = {
    id: "selftest.fail",
    criterion: "self-test",
    claim: "always fails",
    evaluate: () => fail("intentional failure"),
  };
  const ctx: HarnessContext = {};
  const evaluated = evaluateAll([passing, failing], ctx);
  check(evaluated[0]!.result.status === "pass", "passing assertion must report pass");
  check(evaluated[1]!.result.status === "fail", "failing assertion must report fail");
  const s = summarizeReport(evaluated);
  check(s.verdict === "reject", "a single FAIL must produce a REJECT verdict");

  // Pending/blocked must NOT be accepted as pass.
  const pendingOnly = evaluateAll(
    [{ id: "p", criterion: "x", claim: "y", evaluate: () => ({ status: "pending", detail: "" }) }],
    ctx,
  );
  check(summarizeReport(pendingOnly).verdict === "incomplete", "pending-only must be INCOMPLETE, not ACCEPT");
}

// 4. Distributional helpers.
{
  const r = passRate([true, true, false, true]);
  check(r.hits === 3 && r.total === 4 && Math.abs(r.rate - 0.75) < 1e-12, "passRate must be hits/total");
  const s = summarizeStats([2, 4, 4, 4, 5, 5, 7, 9]);
  check(Math.abs(s.mean - 5) < 1e-12, "mean must be 5 for the canonical sample");
  check(Math.abs(s.stddev - 2) < 1e-12, "population stddev must be 2 for the canonical sample");
  check(s.min === 2 && s.max === 9, "min/max must be reported");
}

// 5. Config hash is canonical (key order independent) and discriminating.
{
  check(
    hashConfig({ a: 1, b: [1, 2, { c: 3 }] }) === hashConfig({ b: [1, 2, { c: 3 }], a: 1 }),
    "config hash must ignore key order",
  );
  check(hashConfig({ a: 1 }) !== hashConfig({ a: 2 }), "config hash must distinguish different configs");
}

// 6. Determinism check localizes divergence.
{
  check(checkDeterminism("abcdef", "abcdef").identical, "identical strings must be identical");
  const d = checkDeterminism("abcXef", "abcYef");
  check(!d.identical && d.firstDivergence === 3, "divergence index must be localized");
}

// 7. Derived batch seeds are distinct and replayable.
{
  const s1 = deriveSeeds(12345, 50);
  const s2 = deriveSeeds(12345, 50);
  check(s1.length === 50, "must derive the requested number of seeds");
  check(new Set(s1).size === 50, "derived seeds must be distinct");
  check(s1.every((x, i) => x === s2[i]), "seed derivation must be replayable from the base seed");
}

console.log(`self-test OK — ${checks} checks passed; the harness can produce PASS and FAIL.`);
