/**
 * Map Cursor CSV / Admin API display model names to pricing-registry IDs.
 * Unknown models resolve to null → tokens-only (no list-price scores).
 */

const ALIAS_TO_REGISTRY_ID: Readonly<Record<string, string>> = {
  "composer-2.5": "composer-2.5",
  "composer 2.5": "composer-2.5",
  "composer2.5": "composer-2.5",
  "composer-2": "composer-2.5",
};

export function normalizeModelRaw(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a source model string to a pricing-registry modelId, or null if unknown.
 */
export function resolveCanonicalModelId(modelRaw: string): string | null {
  const key = normalizeModelRaw(modelRaw);
  if (!key) return null;
  if (ALIAS_TO_REGISTRY_ID[key]) {
    return ALIAS_TO_REGISTRY_ID[key]!;
  }
  // Pass through already-canonical registry ids (lowercase).
  if (/^[a-z0-9][a-z0-9._-]*$/.test(key)) {
    return key;
  }
  return null;
}
