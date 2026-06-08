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
 * The engine's permitted `Math` members — the spec §11 enumerated set: `imul`
 * plus the algebraic members CLAUDE.md lists (`min`, `max`, `abs`, `floor`,
 * `trunc`). This is an ALLOWLIST, not a denylist of known-bad names (V-41): any
 * `Math.<member>` not in this set is flagged, so a future regression to ANY
 * transcendental — or `Math.random`, or some newly-added implementation-defined
 * member the old denylist never enumerated — fails the audit, not just the
 * handful a denylist happened to name.
 */
const ALLOWED_MATH: ReadonlySet<string> = new Set([
  "imul",
  "min",
  "max",
  "abs",
  "floor",
  "trunc",
]);

/**
 * Non-Math forbidden token patterns: unseeded randomness via a non-Math source,
 * the host clock, host globals, and host module loaders. (Math is policed by the
 * allowlist above, so a transcendental or `Math.random` is caught there.)
 */
// Patterns match the dangerous USE forms (a call, a `new`, or property/index
// access on a host global) — not the bare English words, which appear
// legitimately in string notes and prose (e.g. "rolling-window length").
const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: /\bnew\s+Date\b|\bDate\s*\.\w/, why: "Date (host clock)" },
  { pattern: /\b(document|window|globalThis|process)\s*[.[]/, why: "host global access" },
  { pattern: /\brequire\s*\(/, why: "CommonJS require (host module loader)" },
  { pattern: /from\s+['"]node:/, why: "Node module import" },
];

/** Matches any `Math.<member>` member access (the member name is captured). */
const MATH_MEMBER = /\bMath\.([a-zA-Z0-9_]+)/g;

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
      // Allowlist gate: any Math member outside the §11 enumerated set is a violation.
      for (const m of line.matchAll(MATH_MEMBER)) {
        const member = m[1]!;
        if (!ALLOWED_MATH.has(member)) {
          violations.push({
            file: file.slice(ENGINES_DIR.length + 1),
            line: i + 1,
            token: m[0],
            why: `Math.${member} is not in the spec §11 permitted set {${[...ALLOWED_MATH].join(", ")}}`,
          });
        }
      }
    });
  }
  return violations;
}
