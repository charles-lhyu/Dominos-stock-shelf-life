import type { SectionId } from "./types";

/**
 * Old chart label → clean product title after the name-tag reading change.
 * Optional sectionId forces storage when the old label encoded it
 * (e.g. Bacon (FROZEN) → Bacon + frozen).
 */
export const CHART_PRODUCT_RENAMES: Record<
  string,
  { name: string; sectionId?: SectionId }
> = {
  "Bacon (FROZEN)": { name: "Bacon", sectionId: "frozen" },
  "NEW Chinese Style Chicken": { name: "Chinese Style Chicken" },
};

export function canonicalProductName(name: string): string {
  const trimmed = name.trim();
  return CHART_PRODUCT_RENAMES[trimmed]?.name ?? trimmed;
}

/** Map hidden / preset product keys onto current chart titles. */
export function migrateProductNames(names: Iterable<string>): string[] {
  return [
    ...new Set(
      [...names]
        .map((name) => canonicalProductName(name))
        .filter((name) => name !== ""),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function migrateProductDefaultEntries<
  T extends { section: SectionId | null; life: unknown },
>(defaults: Record<string, T>): Record<string, T> {
  const migrated: Record<string, T> = {};
  // Plain keys first so a later renamed Bacon (FROZEN) can set frozen when needed.
  const entries = Object.entries(defaults).sort(([a], [b]) => {
    const aRename = CHART_PRODUCT_RENAMES[a.trim()] ? 1 : 0;
    const bRename = CHART_PRODUCT_RENAMES[b.trim()] ? 1 : 0;
    return aRename - bRename || a.localeCompare(b);
  });
  for (const [name, value] of entries) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const rename = CHART_PRODUCT_RENAMES[trimmed];
    const nextName = rename?.name ?? trimmed;
    const section = rename?.sectionId ?? value.section;
    const next = { ...value, section, life: null } as T;
    const existing = migrated[nextName];
    if (!existing) {
      migrated[nextName] = next;
      continue;
    }
    // Renamed storage-tagged row wins its section when collapsing onto one name.
    if (rename?.sectionId) {
      migrated[nextName] = next;
    }
  }
  return migrated;
}
