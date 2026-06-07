/**
 * The assertion framework.
 *
 * The acceptance instrument for this project is this harness (criteria H5): every
 * machine-checkable criterion is encoded as a named assertion that returns a
 * concrete PASS or FAIL — no acceptance verdict rests on a human eyeballing a
 * printed table. A harness that cannot fail is not a harness, so the framework
 * makes failure a first-class, reachable outcome and the run-time proves it
 * (see `harness/self-test.ts`).
 *
 * Each assertion carries a *standalone claim*: a stranger reading the battery,
 * with no access to the private design documents, should understand what the
 * check asserts about the engine and why it matters. The criterion ID (e.g.
 * "A6") is a pointer for maintainers, never a substitute for that explanation.
 *
 * Four statuses, because the build proceeds in stages and honesty about stage is
 * part of the instrument:
 *   - pass    : the condition was evaluated and held.
 *   - fail    : the condition was evaluated and did not hold.
 *   - pending : the check cannot be evaluated yet because the reference engine
 *               (or a needed campaign output) does not exist yet. NOT a pass.
 *   - blocked : the check cannot be evaluated because a governing-document
 *               question is unresolved (a spec point two implementations could
 *               legally read differently, awaiting a decisions-register ruling).
 *               NOT a pass.
 *
 * `pending` and `blocked` never count toward acceptance. An all-green run with
 * pending/blocked items present is explicitly NOT an acceptance pass; the report
 * surfaces the counts so a reader cannot mistake "not yet checked" for "checked
 * and fine".
 */

export type AssertionStatus = "pass" | "fail" | "pending" | "blocked";

export interface AssertionResult {
  readonly status: AssertionStatus;
  /** Human-readable explanation of how this verdict was reached. */
  readonly detail: string;
  /** Optional distributional numbers backing the verdict (mean, rate, etc.). */
  readonly metrics?: Readonly<Record<string, number>>;
}

/** Resources an assertion may consult when it runs. */
export interface HarnessContext {
  /**
   * The reference engine, once it exists. Absent in the skeleton stage; an
   * assertion that needs it returns `pending` while this is undefined. Typed as
   * `unknown` here so the harness skeleton does not depend on the engine's
   * shape before the engine is written; the engine module supplies a typed
   * adapter when wiring it in.
   */
  readonly engine?: unknown;
}

export interface Assertion {
  /** Stable identifier, e.g. "H1" or "A6.composition". */
  readonly id: string;
  /** The criterion this belongs to, e.g. "H1 — Seeded determinism". */
  readonly criterion: string;
  /**
   * A standalone statement of what this assertion claims about the engine and
   * why it matters — readable without the private criteria document.
   */
  readonly claim: string;
  /** Evaluate the assertion against the current harness context. */
  evaluate(ctx: HarnessContext): AssertionResult;
}

// --- Result constructors -------------------------------------------------

export function pass(
  detail: string,
  metrics?: Readonly<Record<string, number>>,
): AssertionResult {
  return metrics ? { status: "pass", detail, metrics } : { status: "pass", detail };
}

export function fail(
  detail: string,
  metrics?: Readonly<Record<string, number>>,
): AssertionResult {
  return metrics ? { status: "fail", detail, metrics } : { status: "fail", detail };
}

/** The reference engine (or a campaign output) does not exist yet. */
export function pending(reason: string): AssertionResult {
  return { status: "pending", detail: reason };
}

/** A governing-document question must be ruled before this can be evaluated. */
export function blocked(reason: string): AssertionResult {
  return { status: "blocked", detail: reason };
}

// --- Registry ------------------------------------------------------------

/**
 * Mutable collection of assertions assembled at startup. Registration order is
 * preserved for stable, legible reports.
 */
export class AssertionRegistry {
  private readonly assertions: Assertion[] = [];
  private readonly ids = new Set<string>();

  register(assertion: Assertion): void {
    if (this.ids.has(assertion.id)) {
      throw new Error(`duplicate assertion id: ${assertion.id}`);
    }
    this.ids.add(assertion.id);
    this.assertions.push(assertion);
  }

  registerAll(assertions: readonly Assertion[]): void {
    for (const a of assertions) this.register(a);
  }

  all(): readonly Assertion[] {
    return this.assertions;
  }
}
