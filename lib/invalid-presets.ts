import {
  CHART_PRODUCT_RENAMES,
  migrateProductDefaultEntries,
} from "./chart-name-migrate";
import type { ProductDefault } from "./item-preset-store";
import { SECTION_TAG } from "./preview";
import type { SectionId, ShelfRule } from "./types";

export type InvalidProductDefault = {
  /** Key still stored on the device. */
  name: string;
  section: SectionId | null;
  reason: "renamed" | "unknown" | "wrong-storage" | "not-needed";
  /** Short line for the warning list. */
  detail: string;
  /** When set, Update rewrites the stored key to this product + storage. */
  update?: { name: string; section: SectionId };
};

function sectionsByProduct(rules: ShelfRule[]): Map<string, Set<SectionId>> {
  const map = new Map<string, Set<SectionId>>();
  for (const rule of rules) {
    const name = rule.name.trim();
    if (!name) continue;
    const sections = map.get(name) ?? new Set<SectionId>();
    sections.add(rule.sectionId);
    map.set(name, sections);
  }
  return map;
}

function storageLabel(section: SectionId | null): string {
  return section ? SECTION_TAG[section] : "none";
}

/**
 * Stored product defaults that no longer match the chart (old titles, wrong
 * storage, single-storage leftovers). Sorted by product name.
 */
export function listInvalidProductDefaults(
  defaults: Record<string, ProductDefault>,
  rules: ShelfRule[],
): InvalidProductDefault[] {
  const sectionsByName = sectionsByProduct(rules);
  const invalid: InvalidProductDefault[] = [];

  for (const [rawName, value] of Object.entries(defaults)) {
    const name = rawName.trim();
    if (!name) continue;
    const section = value.section;
    const rename = CHART_PRODUCT_RENAMES[name];

    if (rename) {
      const nextName = rename.name;
      const nextSection = rename.sectionId ?? section;
      const sections = sectionsByName.get(nextName);
      if (!sections || sections.size === 0) {
        invalid.push({
          name,
          section,
          reason: "renamed",
          detail: `${name} is no longer on the chart`,
        });
        continue;
      }
      if (sections.size < 2) {
        // Title changed, but a storage default is unused on a single-storage product.
        invalid.push({
          name,
          section,
          reason: "renamed",
          detail: `${name} is now ${nextName} — remove this default`,
        });
        continue;
      }
      const updateSection =
        nextSection && sections.has(nextSection) ? nextSection : [...sections][0]!;
      invalid.push({
        name,
        section,
        reason: "renamed",
        detail: `${name} is now ${nextName} (${storageLabel(updateSection)})`,
        update: { name: nextName, section: updateSection },
      });
      continue;
    }

    const sections = sectionsByName.get(name);
    if (!sections || sections.size === 0) {
      invalid.push({
        name,
        section,
        reason: "unknown",
        detail: `${name} is not on this chart`,
      });
      continue;
    }

    if (!section || !sections.has(section)) {
      const fallback = [...sections][0];
      invalid.push({
        name,
        section,
        reason: "wrong-storage",
        detail: section
          ? `${name} has no ${storageLabel(section).toLowerCase()} row on this chart`
          : `${name} has no storage chosen`,
        update: fallback ? { name, section: fallback } : undefined,
      });
      continue;
    }

    if (sections.size < 2) {
      invalid.push({
        name,
        section,
        reason: "not-needed",
        detail: `${name} only has one storage on this chart`,
      });
    }
  }

  return invalid.sort((a, b) => a.name.localeCompare(b.name));
}

/** Defaults used for list / details: rename old chart labels, drop invalids. */
export function chartProductDefaults(
  defaults: Record<string, ProductDefault>,
  rules: ShelfRule[],
  hidden: Iterable<string> = [],
): Record<string, ProductDefault> {
  const hiddenNames = new Set(
    [...hidden].map((item) => item.trim()).filter((item) => item !== ""),
  );
  const sectionsByName = sectionsByProduct(rules);
  const kept: Record<string, ProductDefault> = {};
  for (const [name, value] of Object.entries(migrateProductDefaultEntries(defaults))) {
    const trimmed = name.trim();
    if (!trimmed || hiddenNames.has(trimmed)) continue;
    const sections = sectionsByName.get(trimmed);
    if (!sections || sections.size < 2) continue;
    if (!value.section || !sections.has(value.section)) continue;
    kept[trimmed] = { section: value.section, life: null };
  }
  return kept;
}
