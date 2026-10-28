import {
  canonicalProductName,
  migrateProductDefaultEntries,
} from "./chart-name-migrate";
import {
  isProductHidden,
  parseHiddenEntries,
  type HiddenEntry,
} from "./hidden-entries";
import type { LifeKind } from "./preview";
import type { SectionId, ShelfRule } from "./types";

const STORAGE_KEY = "shelf-life-item-preset-v1";
const LAST_SECTION_KEY = "shelf-life-last-section";
const LAST_LIFE_KEY = "shelf-life-last-life";

const SECTIONS = new Set<SectionId>(["frozen", "chilled", "ready", "ambient", "pack"]);
const LIVES = new Set<LifeKind>(["stock", "prepped", "ambient"]);

/** One product's chosen storage. Life is never stored per item. */
export type ProductDefault = {
  section: SectionId | null;
  /** Always null — kept for older saved payloads. */
  life: LifeKind | null;
};

/** List filters, plus each product's default storage and life. */
export type ItemPreset = {
  section: SectionId | null;
  life: LifeKind | null;
  sectionFilter: SectionId | "all";
  lifeFilter: LifeKind | "all";
  category: string | "all";
  defaults: Record<string, ProductDefault>;
};

export const DEFAULT_ITEM_PRESET: ItemPreset = {
  section: null,
  life: null,
  sectionFilter: "all",
  lifeFilter: "all",
  category: "all",
  defaults: {},
};

function isSection(value: unknown): value is SectionId {
  return typeof value === "string" && SECTIONS.has(value as SectionId);
}

function isLife(value: unknown): value is LifeKind {
  return typeof value === "string" && LIVES.has(value as LifeKind);
}

function normalizeDefaults(value: unknown): Record<string, ProductDefault> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const defaults: Record<string, ProductDefault> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    const trimmed = name.trim();
    if (!trimmed || !entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const section = isSection(raw.section) ? raw.section : null;
    // Per-item life defaults are not used — drop any stored life.
    if (!section) continue;
    // Keep old chart labels as stored (Bacon (FROZEN)) so Settings can warn
    // and offer Update / Remove. List matching uses chartProductDefaults.
    defaults[trimmed] = { section, life: null };
  }
  return defaults;
}

/**
 * Keep a storage choice when the product has more than one storage row.
 * Life is never kept. Hidden products keep none.
 */
export function retainProductDefaults(
  defaults: Record<string, ProductDefault>,
  rules: ShelfRule[],
  hidden: Iterable<string | HiddenEntry>,
): Record<string, ProductDefault> {
  const hiddenEntries = parseHiddenEntries([...hidden]);
  const sectionsByName = new Map<string, Set<SectionId>>();
  for (const rule of rules) {
    const name = rule.name.trim();
    if (!name) continue;
    const sections = sectionsByName.get(name) ?? new Set<SectionId>();
    sections.add(rule.sectionId);
    sectionsByName.set(name, sections);
  }
  const kept: Record<string, ProductDefault> = {};
  for (const [name, value] of Object.entries(migrateProductDefaultEntries(defaults))) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const sections = sectionsByName.get(trimmed);
    if (!sections || sections.size < 2) continue;
    if (isProductHidden(hiddenEntries, trimmed, sections)) continue;
    if (!value.section || !sections.has(value.section)) continue;
    // A storage-specific hide drops only that storage default.
    if (
      value.section &&
      hiddenEntries.some(
        (entry) =>
          entry.name === trimmed &&
          (entry.section == null || entry.section === value.section),
      )
    ) {
      continue;
    }
    kept[trimmed] = { section: value.section, life: null };
  }
  return kept;
}

function sameDefaults(
  a: Record<string, ProductDefault>,
  b: Record<string, ProductDefault>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => {
    if (key !== bKeys[index]) return false;
    return a[key]?.section === b[key]?.section;
  });
}

export function normalizeItemPreset(value: unknown): ItemPreset {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const category =
    typeof raw.category === "string" && raw.category.trim() ? raw.category : "all";
  return {
    section: isSection(raw.section) ? raw.section : null,
    life: isLife(raw.life) ? raw.life : null,
    sectionFilter:
      raw.sectionFilter === "all" || isSection(raw.sectionFilter) ? raw.sectionFilter : "all",
    lifeFilter: raw.lifeFilter === "all" || isLife(raw.lifeFilter) ? raw.lifeFilter : "all",
    category,
    defaults: normalizeDefaults(raw.defaults),
  };
}

export function sameItemPreset(a: ItemPreset, b: ItemPreset): boolean {
  return (
    a.section === b.section &&
    a.life === b.life &&
    a.sectionFilter === b.sectionFilter &&
    a.lifeFilter === b.lifeFilter &&
    a.category === b.category &&
    sameDefaults(a.defaults, b.defaults)
  );
}

let preset: ItemPreset = DEFAULT_ITEM_PRESET;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function write() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
    }
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}

function readLegacy(): ItemPreset {
  try {
    return normalizeItemPreset({
      section: window.localStorage.getItem(LAST_SECTION_KEY),
      life: window.localStorage.getItem(LAST_LIFE_KEY),
    });
  } catch {
    return DEFAULT_ITEM_PRESET;
  }
}

export function hydrateItemPresetStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      preset = normalizeItemPreset(JSON.parse(raw));
      return;
    }
  } catch {
    // Fall through to the older section / life keys.
  }
  const legacy = readLegacy();
  if (sameItemPreset(legacy, DEFAULT_ITEM_PRESET)) return;
  preset = legacy;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // Ignore quota / private mode.
  }
}

export function getItemPreset(): ItemPreset {
  return preset;
}

export function getItemPresetServer(): ItemPreset {
  return DEFAULT_ITEM_PRESET;
}

export function subscribeItemPreset(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(partial: Partial<ItemPreset>) {
  hydrateItemPresetStore();
  const next = normalizeItemPreset({ ...preset, ...partial });
  if (sameItemPreset(preset, next)) return;
  preset = next;
  write();
}

export function setPreferredSection(section: SectionId | null) {
  update({ section });
}

export function setPreferredLife(life: LifeKind | null) {
  update({ life });
}

export function setPresetSectionFilter(sectionFilter: SectionId | "all") {
  update({ sectionFilter });
}

export function setPresetLifeFilter(lifeFilter: LifeKind | "all") {
  update({ lifeFilter });
}

export function setPresetCategory(category: string | "all") {
  update({ category });
}

function sectionsForProduct(name: string, rules: ShelfRule[]): Set<SectionId> {
  const trimmed = canonicalProductName(name);
  const sections = new Set<SectionId>();
  if (!trimmed) return sections;
  for (const rule of rules) {
    if (rule.name.trim() === trimmed) sections.add(rule.sectionId);
  }
  return sections;
}

/** True when the chart has more than one storage row for this product. */
export function productHasMultipleStorages(name: string, rules: ShelfRule[]): boolean {
  return sectionsForProduct(name, rules).size > 1;
}

/**
 * Remember one product's storage, for example Pepperoni as chilled.
 * Life is not saved. Single-storage products are never stored — there is
 * nothing to choose — and any leftover default for that name is dropped.
 */
export function setProductDefault(
  name: string,
  partial: { section?: SectionId | null; life?: LifeKind | null },
  rules: ShelfRule[] = [],
) {
  hydrateItemPresetStore();
  const trimmed = canonicalProductName(name);
  if (!trimmed) return;
  const current =
    preset.defaults[trimmed] ??
    preset.defaults[name.trim()] ?? { section: null, life: null };
  const section = partial.section !== undefined ? partial.section : current.section;
  const defaults = { ...preset.defaults };
  // Drop any stale label for this product when writing the clean title.
  for (const key of Object.keys(defaults)) {
    if (key === trimmed) continue;
    if (canonicalProductName(key) === trimmed) delete defaults[key];
  }
  if (!section) {
    delete defaults[trimmed];
  } else if (rules.length > 0 && !productHasMultipleStorages(trimmed, rules)) {
    delete defaults[trimmed];
  } else {
    defaults[trimmed] = { section, life: null };
  }
  update({ defaults });
}

/** Drop defaults that are not worth keeping for the current chart. */
export function pruneProductDefaults(
  rules: ShelfRule[],
  hidden: Iterable<string | HiddenEntry> = [],
) {
  hydrateItemPresetStore();
  const next = retainProductDefaults(preset.defaults, rules, hidden);
  if (sameDefaults(preset.defaults, next)) return;
  update({ defaults: next });
}

/** Remove one stored default by its exact saved key (including old chart labels). */
export function removeProductDefault(name: string) {
  hydrateItemPresetStore();
  const trimmed = name.trim();
  if (!trimmed || !preset.defaults[trimmed]) return;
  const defaults = { ...preset.defaults };
  delete defaults[trimmed];
  update({ defaults });
}

/** Rewrite one invalid default to a chart product + storage (Update in Settings). */
export function applyProductDefaultUpdate(
  fromName: string,
  next: { name: string; section: SectionId },
  rules: ShelfRule[] = [],
) {
  hydrateItemPresetStore();
  const from = fromName.trim();
  const to = next.name.trim();
  if (!from || !to || !isSection(next.section)) return;
  const defaults = { ...preset.defaults };
  delete defaults[from];
  for (const key of Object.keys(defaults)) {
    if (key === to) continue;
    if (canonicalProductName(key) === to) delete defaults[key];
  }
  // Single-storage products have nothing to choose — drop instead of rewriting.
  if (rules.length > 0 && !productHasMultipleStorages(to, rules)) {
    update({ defaults });
    return;
  }
  defaults[to] = { section: next.section, life: null };
  update({ defaults });
}

export function clearProductDefaults() {
  hydrateItemPresetStore();
  if (Object.keys(preset.defaults).length === 0) return;
  update({ defaults: {} });
}

export function replaceItemPreset(value: unknown) {
  hydrateItemPresetStore();
  const next = normalizeItemPreset(value);
  if (sameItemPreset(preset, next)) return;
  preset = next;
  write();
}

export function resetItemPreset() {
  replaceItemPreset(DEFAULT_ITEM_PRESET);
}
