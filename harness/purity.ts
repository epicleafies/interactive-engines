/**
 * Engine platform-purity audit (decisions register D-011; supports criteria
 * H1/H4 cross-platform bit-identical replay).
 *
 * The engine must behave identically under V8 (web/Node) and Hermes (React
 * Native). That requires it to avoid (1) implementation-defined transcendental
 * math, whose last bits differ across engines; (2) `Math.random`, which would
 * make runs unseeded and unreplayable; and (3) host APIs (`Date`, DOM, Node).
 * This audit scans the engine source for those tokens and reports every
 * occurrence, so a regression is a concrete FAIL rather than a latent
 * cross-platform divergence discovered in the field.
 *
 * This is harness code and may read the filesystem; it inspects engine source
 * but is not part of the engine.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINES_DIR = fileURLToPath(new URL("../engines", import.meta.url));

/**
 * Forbidden token patterns. Transcendental / implementation-defined Math
 * functions (algebraic `sqrt`/`abs`/`min`/`max`/`floor`/`trunc` and `imul` are
 * permitted and not listed here), plus `Math.random`, `Date`, and host globals.
 */
// Patterns match the dangerous USE forms (a call, a `new`, or property/index
// access on a host global) — not the bare English words, which appear
// legitimately in string notes and prose (e.g. "rolling-window length").
const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: /\bMath\.(exp|expm1|pow|log|log2|log10|log1p|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|hypot)\s*\(/, why: "transcendental/implementation-defined math" },
  { pattern: /\bMath\.random\s*\(/, why: "Math.random (unseeded randomness)" },
  { pattern: /\bnew\s+Date\b|\bDate\s*\.\w/, why: "Date (host clock)" },
  { pattern: /\b(document|window|globalThis|process)\s*[.[]/, why: "host global access" },
  { pattern: /\brequire\s*\(/, why: "CommonJS require (host module loader)" },
  { pattern: /from\s+['"]node:/, why: "Node module import" },
];

export interface PurityViolation {
  readonly file: string;
  readonly line: number;
  readonly token: string;
  readonly why: string;
}

/** Strip line and block comments so prose mentioning a forbidden token is not flagged. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

export function auditEnginePurity(): PurityViolation[] {
  const violations: PurityViolation[] = [];
  for (const file of listTsFiles(ENGINES_DIR)) {
    const stripped = stripComments(readFileSync(file, "utf8"));
    const lines = stripped.split("\n");
    lines.forEach((line, i) => {
      for (const { pattern, why } of FORBIDDEN) {
        const m = pattern.exec(line);
        if (m) {
          violations.push({
            file: file.slice(ENGINES_DIR.length + 1),
            line: i + 1,
            token: m[0],
            why,
          });
        }
      }
    });
  }
  return violations;
}
