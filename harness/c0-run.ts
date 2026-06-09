/**
 * C0 village re-run (Phase 3; D-063) — executes runC0Village(), prints the
 * per-dimension feasibility + the C0-FILLED bars, and writes the sweep artifacts
 * (per-beat JSON + a summary). QA output (public, D-009); read by the C0 closing
 * entry, which ratifies the filled bars (D-057(h)).
 *
 * C1 grades on the registered focal-relative A(g) round bar (unchanged). C3/C4
 * grade on their relocated per-dimension statistics (persistence / circulation);
 * their bar NUMBERS are filled here from the swept evidence by the registered H6
 * headroom rule (D-057(a): >= 20% relative beyond the teaching cell's observed
 * value, in the failable direction) — NOT read off a diagnostic (D-063). C5
 * carries no bar this pass (pending its scaled module). The held items the metric
 * resolution unblocked are folded into the sweep: thinness/ceiling (N<=16),
 * homeGoods placement (spec §8), and the DOM_MIN_TRADE_SHARE×WINDOW_ROUNDS joint.
 *
 * Harness code: may use Node/console/fs. The engine stays platform-pure.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runC0Village, type C0BeatReport, type C0Cell, type DerivedBar } from "./c0.ts";
import { runC5Calibration, type C5CalibrationReport, type C5Cell } from "./c5-calibration.ts";

const f = (x: number): string => (Number.isNaN(x) ? "  —  " : x.toFixed(3));

function renderBar(b: DerivedBar): string {
  const failable = b.nonTriviallyFailable ? "failable" : "NOT-FAILABLE (flag: no swept cell fails it)";
  return `      [${b.role.toUpperCase()}] ${b.name} = ${f(b.value)}  [H6: ${b.failableDirection} 20% from observed ${f(b.observedBase)}; ${failable}]\n        basis: ${b.basis}`;
}

function renderCell(c: C0Cell): string {
  const mark = c.meetsBar ? "PASS" : "    ";
  const id = `${c.axis}=${c.value}`.padEnd(20);
  const t = c.teaching ? " " : "·"; // · marks a robustness cell (not a teaching candidate)
  const dim = c.metric === "acceptance"
    ? `favA=${f(c.favoredStatMean)}`
    : c.metric === "circulation"
      ? `refusalGap=${f(c.refusalGapMean)} | circ-corrob=${f(c.corroboratingPassRate)} (fav/worst=${f(c.favoredStatMean)}/${f(c.worstStatMean)})`
      : `fav=${f(c.favoredStatMean)} worst=${f(c.worstStatMean)} margin[mean/p05]=${f(c.marginMean)}/${f(c.marginP05)} ordered=${f(c.orderedRate)}`;
  // For C4 `pass` is the PRIMARY refusal-differential gate (D-065); `circ-corrob` is the corroborating circulation check.
  return `  [${mark}]${t}${id} pass=${f(c.passRate)}  noEv=${f(c.noEvidenceRate)} cap=${f(c.capOutRate)} | ${dim}`;
}

function render(reports: readonly C0BeatReport[]): string {
  const lines: string[] = [];
  lines.push("C0 village re-run — per-dimension bars (criteria v2.4; D-059/060/061/063/065; 50-seed batches)");
  lines.push("bars C0-FILLED per H6 (D-057(a)); teaching cell cited; · = robustness cell. C4 gate is refusal-primary (D-065).");
  lines.push("");
  for (const b of reports) {
    lines.push(`=== ${b.id} (${b.focal}, metric=${b.metric}) ===`);
    lines.push(`    ${b.feasible ? "FEASIBLE — the teaching cell meets its pass-rate bar" : "NOT REACHED — no teaching cell meets the bar (C0-escape candidate; register ruling, not a bar move)"}`);
    lines.push(`    teaching cell: ${b.teachingCell}`);
    if (b.metric === "acceptance") {
      lines.push(`    pass-rate bar = ${f(b.passRateBar.value)}  [${b.passRateBar.basis}]`);
    } else {
      lines.push("    C0-filled bars (H6 — for closing-entry ratification):");
      lines.push(renderBar(b.passRateBar));
      for (const bar of b.bars) lines.push(renderBar(bar));
    }
    const cells = [...b.cells].sort((x, y) => y.passRate - x.passRate);
    for (const c of cells) lines.push(renderCell(c));
    lines.push("");
  }
  const feasible = reports.filter((b) => b.feasible).map((b) => b.id);
  const escape = reports.filter((b) => !b.feasible).map((b) => b.id);
  lines.push(`Beats reaching their bar: ${feasible.join(", ") || "(none)"}`);
  lines.push(`Beats NOT reaching their bar (escape candidates): ${escape.join(", ") || "(none)"}`);
  return lines.join("\n");
}

// --- C5 scaled regional/merge grading (D-072/D-073; calibration in c5-calibration.ts) ---

function renderC5Bar(b: DerivedBar): string {
  const failable = b.nonTriviallyFailable ? "failable" : "NOT-FAILABLE (flag: no cited cell fails it)";
  return `      [${b.role.toUpperCase()}] ${b.name} = ${f(b.value)}  [H6: ${b.failableDirection} 20% from observed ${f(b.observedBase)}; ${failable}]\n        basis: ${b.basis}`;
}

function renderC5Cell(c: C5Cell): string {
  const o = c.outcome;
  const tag = c.role === "teaching" ? "TEACH" : c.role === "context" ? " ctx " : "FAIL*";
  return `  [${tag}] ${`${c.label}`.padEnd(48)} E1=${f(o.e1FormRate)} conv=${f(o.convergedRate)} E2=${f(o.e2MergeRate)} E3=${f(o.e3DecidesRate)} (n=${o.e3ConditioningRuns}) regDef=${f(o.regionalDefinedRate)}`;
}

function renderC5(report: C5CalibrationReport): string {
  const lines: string[] = [];
  lines.push(`=== C5 (${report.focal}, scaled regional/merge grading; D-072/D-073; 50-seed batches) ===`);
  lines.push(`    ${report.feasible ? "FEASIBLE — the teaching cell meets all three E-series bars" : "NOT REACHED — the teaching cell misses a bar (C0-escape candidate; register ruling, not a bar move)"}`);
  lines.push(`    teaching cell: ${report.teachingCell}`);
  lines.push("    merge-winner = robust born-dominance over GLOBAL A(g) (classifyEmergence/convergenceWinner); never the DOMINANCE event (D-072)");
  lines.push("    C0-filled bars (H6 — for closing-entry ratification; FAIL* marks the cited failability cell per bar):");
  for (const b of report.bars) lines.push(renderC5Bar(b));
  const e3Bar = report.bars[2]!.value;
  lines.push(`        E3 chance baseline (3-good): ${f(report.e3ChanceBaseline)} — the E3 bar ${e3Bar > report.e3ChanceBaseline ? "exceeds" : "does NOT exceed"} chance`);
  for (const c of report.cells) lines.push(renderC5Cell(c));
  return lines.join("\n");
}

/** The filled-bar table, the deliverable the closing entry ratifies (D-057(h)). */
function filledBars(reports: readonly C0BeatReport[]) {
  return reports.map((b) => ({
    id: b.id,
    metric: b.metric,
    teachingCell: b.teachingCell,
    feasible: b.feasible,
    bars: [b.passRateBar, ...b.bars],
  }));
}

function main(): void {
  const reports = runC0Village();
  const villageText = render(reports);

  // C5 scaled regional/merge calibration (D-072/D-073) — a distinct scaled-mode
  // construction, graded on E1/E2/E3 via the robust measure (not the village A(g)
  // beats), folded into the same C0 campaign output.
  const c5 = runC5Calibration();
  const c5Text = renderC5(c5);

  const text = `${villageText}\n${c5Text}`;
  console.log(text);

  const dir = fileURLToPath(new URL("./c0-artifacts", import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const b of reports) {
    writeFileSync(`${dir}/${b.id}.json`, JSON.stringify(b, null, 2) + "\n");
  }
  writeFileSync(`${dir}/C5.json`, JSON.stringify(c5, null, 2) + "\n");
  writeFileSync(`${dir}/SUMMARY.txt`, text + "\n");
  const c5BarsEntry = { id: c5.id, metric: "scaled-regional/merge", teachingCell: c5.teachingCell, feasible: c5.feasible, bars: c5.bars };
  writeFileSync(
    `${dir}/FILLED_BARS.json`,
    JSON.stringify(
      {
        register: "D-063 (village C1/C3/C4); D-073 (C5 scaled E1/E2/E3)",
        method: "H6 headroom (D-057(a)); closing entry ratifies (D-057(h))",
        beats: [...filledBars(reports), c5BarsEntry],
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    `${dir}/index.json`,
    JSON.stringify(
      {
        register: "D-063 (village); D-073 (C5 scaled)",
        beats: [
          ...reports.map((b) => ({ id: b.id, focal: b.focal, metric: b.metric, feasible: b.feasible, teachingCell: b.teachingCell, cells: b.cells.length })),
          { id: c5.id, focal: c5.focal, metric: "scaled-regional/merge", feasible: c5.feasible, teachingCell: c5.teachingCell, cells: c5.cells.length },
        ],
      },
      null,
      2,
    ) + "\n",
  );
}

main();
