/**
 * Acceptance-harness entry point.
 *
 * Builds the criteria battery, evaluates it against the current context (no
 * reference engine yet — engine-dependent assertions therefore report `pending`,
 * not `pass`), and prints the distributional report. Exit code: non-zero on any
 * FAIL, so CI fails loudly; an INCOMPLETE run (pending/blocked present, no fails)
 * exits zero but is clearly labeled and never read as acceptance.
 *
 * This is harness code, not engine code: it may use Node/console. The engine
 * stays platform-pure.
 */

import { AssertionRegistry, type HarnessContext } from "./assert.ts";
import { allAssertions } from "./criteria.ts";
import { evaluateAll, renderReport, summarize } from "./report.ts";

function main(): void {
  const registry = new AssertionRegistry();
  registry.registerAll(allAssertions());

  // No engine wired yet (build-order step 2 is gated on register rulings A-D).
  const ctx: HarnessContext = {};

  const evaluated = evaluateAll(registry.all(), ctx);
  console.log(renderReport(evaluated));

  const summary = summarize(evaluated);
  process.exitCode = summary.fail > 0 ? 1 : 0;
}

main();
