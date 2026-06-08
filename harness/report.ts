/**
 * Distributional reporting.
 *
 * The harness reports distributions and per-criterion verdicts, never a single
 * run dressed up as "the result" (criteria H2). This module renders the
 * evaluated assertions into a legible report and computes the overall acceptance
 * verdict with a deliberately strict rule: acceptance requires that there are
 * zero failures AND nothing left unevaluated. A run with `pending` or `blocked`
 * items is reported as INCOMPLETE, never as a pass — "not yet checked" must
 * never read as "checked and fine".
 */

import type { Assertion, AssertionResult, AssertionStatus, HarnessContext } from "./assert.ts";
import { ENGINE_VERSION, CRITERIA_VERSION } from "./version.ts";

export interface EvaluatedAssertion {
  readonly assertion: Assertion;
  readonly result: AssertionResult;
}

export interface ReportSummary {
  readonly pass: number;
  readonly fail: number;
  readonly pending: number;
  readonly blocked: number;
  readonly total: number;
  /**
   * Overall acceptance verdict:
   *   - "accept"     : every assertion evaluated and passed.
   *   - "reject"     : at least one assertion failed.
   *   - "incomplete" : no failures, but some assertions are pending/blocked.
   */
  readonly verdict: "accept" | "reject" | "incomplete";
}

export function evaluateAll(
  assertions: readonly Assertion[],
  ctx: HarnessContext,
): EvaluatedAssertion[] {
  return assertions.map((assertion) => ({ assertion, result: assertion.evaluate(ctx) }));
}

export function summarize(evaluated: readonly EvaluatedAssertion[]): ReportSummary {
  const count: Record<AssertionStatus, number> = { pass: 0, fail: 0, pending: 0, blocked: 0 };
  for (const e of evaluated) count[e.result.status]++;
  const verdict: ReportSummary["verdict"] =
    count.fail > 0 ? "reject" : count.pending + count.blocked > 0 ? "incomplete" : "accept";
  return {
    pass: count.pass,
    fail: count.fail,
    pending: count.pending,
    blocked: count.blocked,
    total: evaluated.length,
    verdict,
  };
}

const GLYPH: Record<AssertionStatus, string> = {
  pass: "PASS ",
  fail: "FAIL ",
  pending: "PEND ",
  blocked: "BLOCK",
};

/** Render a full text report. Returns the report as a string for printing/capture. */
export function renderReport(evaluated: readonly EvaluatedAssertion[]): string {
  const lines: string[] = [];
  lines.push("Money Emergence Simulation — acceptance harness");
  lines.push(`engine ${ENGINE_VERSION}  ·  criteria ${CRITERIA_VERSION}`);
  lines.push("");

  for (const { assertion, result } of evaluated) {
    lines.push(`[${GLYPH[result.status]}] ${assertion.id.padEnd(18)} ${assertion.criterion}`);
    lines.push(`           ${result.detail}`);
    if (result.metrics) {
      const parts = Object.entries(result.metrics).map(([k, v]) => `${k}=${formatNum(v)}`);
      if (parts.length > 0) lines.push(`           (${parts.join("  ")})`);
    }
  }

  const s = summarize(evaluated);
  lines.push("");
  lines.push(
    `${s.total} assertions: ${s.pass} pass · ${s.fail} fail · ` +
      `${s.pending} pending · ${s.blocked} blocked`,
  );
  lines.push(`VERDICT: ${s.verdict.toUpperCase()}`);
  if (s.verdict === "incomplete") {
    lines.push(
      "  (incomplete: the reference engine is implemented and its assertions are wired and evaluated live. The " +
        "remaining pendings are deferred by BUILD STAGE — a tuned campaign configuration (C0+, tuned TBD " +
        "constants unfilled) or a learner-facing surface (steps 6-7) — not a missing engine. blocked = awaiting " +
        "a decisions-register ruling. Neither pending nor blocked counts as acceptance.)",
    );
  }
  return lines.join("\n");
}

function formatNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(4);
}
