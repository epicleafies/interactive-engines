/**
 * C0+ campaign runner — the machinery the feasibility and tuning campaigns run
 * on, built now (per the M6 forward item) so the C0 gate can open on day one.
 * It contains NO tuning, NO numbers, and NO teaching parameters: just the sweep
 * harness, the distributional reporting (criteria H2), and the register-stamped
 * TBD intake (criteria H6).
 *
 *   - Sweep: a base configuration plus zero or more axes; the runner takes the
 *     Cartesian product of the axes, and for each resulting cell runs an N-seed
 *     batch and summarizes per-metric distributions and an optional pass-rate.
 *   - H2: every cell reports distributions (mean, spread, quantiles, pass-rate)
 *     over its batch — never a single run.
 *   - H6: the runner REFUSES to start unless every constant the spec relies on
 *     that the registry still marks TBD is declared with a value AND a citation
 *     to the register entry that authorizes it. Bounds ratify targets before the
 *     campaign that tests them; an undeclared TBD is a hard stop, not a default.
 */

import { run } from "../engines/emergence/index.ts";
import type { Config, RunResult } from "../engines/emergence/types.ts";
import { CONSTANTS } from "../engines/emergence/constants.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { summarize, passRate, type Summary, type RateResult } from "./stats.ts";
import { hashConfig } from "./hash.ts";

/** One sweep axis: a named set of values and how each value is applied to a config. */
export interface SweepAxis {
  readonly name: string;
  readonly values: readonly unknown[];
  readonly apply: (config: Config, value: unknown) => Config;
}

/** A per-run metric extracted from a run result, summarized across the batch. */
export interface MetricDef {
  readonly name: string;
  readonly extract: (result: RunResult) => number;
}

/**
 * A TBD constant filled for this campaign (criteria H6): the value used and the
 * register entry that authorizes it. Bounds are ratified, not back-filled.
 */
export interface TbdDeclaration {
  readonly constant: string;
  readonly value: number;
  readonly registerEntry: string;
}

export interface CampaignSpec {
  readonly name: string;
  readonly base: Config;
  readonly axes?: readonly SweepAxis[];
  /** Seeds per cell; defaults to the H2 batch size (50). */
  readonly seedsPerConfig?: number;
  readonly baseSeed: number;
  readonly metrics: readonly MetricDef[];
  /** Declarations for every registry-TBD constant the base config relies on (H6). */
  readonly tbdDeclarations: readonly TbdDeclaration[];
  /** Optional per-run pass/fail, summarized as a pass-rate per cell. */
  readonly passPredicate?: (result: RunResult) => boolean;
}

export interface CellReport {
  readonly axisValues: Readonly<Record<string, unknown>>;
  readonly configHash: string;
  readonly seeds: number;
  readonly metrics: Readonly<Record<string, Summary>>;
  readonly passRate?: RateResult;
}

export interface CampaignReport {
  readonly name: string;
  readonly cells: readonly CellReport[];
}

/**
 * H6 intake check. Returns the list of violations (empty = clean): every
 * constant the registry marks TBD must carry a declaration whose value matches
 * the base config and which cites a register entry.
 */
export function enforceH6(spec: CampaignSpec): string[] {
  const violations: string[] = [];
  const declared = new Map(spec.tbdDeclarations.map((d) => [d.constant, d]));
  const constants = spec.base.constants as unknown as Record<string, number>;

  for (const c of CONSTANTS) {
    if (c.status !== "tbd") continue;
    const used = constants[c.name];
    const decl = declared.get(c.name);
    if (decl === undefined) {
      violations.push(`${c.name} is TBD in the registry but has no campaign declaration (H6: declare it with a register entry before the campaign)`);
      continue;
    }
    if (!decl.registerEntry || decl.registerEntry.trim() === "") {
      violations.push(`${c.name} declaration cites no register entry (H6: bounds ratify a registered target)`);
    }
    if (used !== undefined && decl.value !== used) {
      violations.push(`${c.name} declaration value ${decl.value} != base config value ${used}`);
    }
  }
  return violations;
}

/** Cartesian product of the axes, as a list of {axis -> value} assignments. */
function cells(axes: readonly SweepAxis[]): Array<Record<string, unknown>> {
  let acc: Array<Record<string, unknown>> = [{}];
  for (const axis of axes) {
    const next: Array<Record<string, unknown>> = [];
    for (const partial of acc) {
      for (const value of axis.values) next.push({ ...partial, [axis.name]: value });
    }
    acc = next;
  }
  return acc;
}

/**
 * Run a campaign: the H6 gate first (a hard stop on any undeclared TBD), then an
 * N-seed batch per cell, summarized distributionally (H2).
 */
export function runCampaign(spec: CampaignSpec): CampaignReport {
  const violations = enforceH6(spec);
  if (violations.length > 0) {
    throw new Error(`campaign "${spec.name}" H6 intake failed:\n  - ${violations.join("\n  - ")}`);
  }
  const seedCount = spec.seedsPerConfig ?? DEFAULT_BATCH_SIZE;
  const axes = spec.axes ?? [];

  const reports: CellReport[] = [];
  for (const assignment of cells(axes)) {
    let config = spec.base;
    for (const axis of axes) config = axis.apply(config, assignment[axis.name]);

    const seeds = deriveSeeds(spec.baseSeed, seedCount);
    const results = seeds.map((s) => run(config, s));

    const metrics: Record<string, Summary> = {};
    for (const m of spec.metrics) metrics[m.name] = summarize(results.map(m.extract));

    const cell: CellReport = {
      axisValues: assignment,
      configHash: hashConfig(config),
      seeds: seedCount,
      metrics,
      ...(spec.passPredicate ? { passRate: passRate(results.map(spec.passPredicate)) } : {}),
    };
    reports.push(cell);
  }
  return { name: spec.name, cells: reports };
}
