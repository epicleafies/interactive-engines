/**
 * Acceptance-harness entry point.
 *
 * Builds the criteria battery, evaluates it, and prints the distributional
 * report. Engine-backed assertions evaluate live against the implemented
 * reference engine (which they import directly); the remaining assertions report
 * `pending` because they need a tuned campaign configuration or a learner-facing
 * surface — deferred by build stage, not by a missing engine. Exit code:
 * non-zero on any FAIL, so CI fails loudly; an INCOMPLETE run (pending/blocked
 * present, no fails) exits zero but is clearly labeled and never read as acceptance.
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

  // Engine-backed assertions import the reference engine directly and evaluate
  // live; the context carries no engine handle (the field is vestigial — kept on
  // HarnessContext for the skeleton-stage API only).
  const ctx: HarnessContext = {};

  const evaluated = evaluateAll(registry.all(), ctx);
  console.log(renderReport(evaluated));

  const summary = summarize(evaluated);
  process.exitCode = summary.fail > 0 ? 1 : 0;
}

main();
