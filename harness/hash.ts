/**
 * Deterministic, platform-independent hashing for run records.
 *
 * A run is identified by the hash of its configuration so that two runs claiming
 * to be "the same configuration" can be checked to actually be so, and so a
 * recorded run can be matched back to the config that produced it (criteria H4:
 * every learner-facing run records its full configuration and can be replayed
 * exactly). This is an identity/provenance hash, not a security hash; it only
 * needs to be stable and collision-resistant enough to distinguish configs.
 *
 * Implementation: FNV-1a over a canonical JSON serialization. Canonicalization
 * sorts object keys recursively so that key ordering never changes the hash.
 */

/** Serialize a value to JSON with object keys sorted recursively. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * FNV-1a 32-bit hash of a string, returned as an 8-char lowercase hex string.
 * Uses only 32-bit integer ops (`Math.imul`, XOR), so the digest is identical
 * across engines.
 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Canonical-config hash: the value stamped into a run record. */
export function hashConfig(config: unknown): string {
  return fnv1a(canonicalJson(config));
}
