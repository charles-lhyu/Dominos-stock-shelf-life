import {
  canonicalProductName,
  migrateProductDefaultEntries,
} from "./chart-name-migrate";
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
    defaults[trimmed] = { section, life: null };
  }
  // Bacon (FROZEN) → Bacon, NEW Chinese Style Chicken → Chinese Style Chicken, etc.
  return migrateProductDefaultEntries(defaults);
}

/**
 * Keep a storage choice when the product has more than one storage row.
 * Life is never kept. Hidden products keep none.
 */
export function retainProductDefaults(
  defaults: Record<string, ProductDefault>,
  rules: ShelfRule[],
  hidden: Iterable<string>,
): Record<string, ProductDefault> {
  const hiddenNames = new Set(
    [...hidden].map((name) => name.trim()).filter((name) => name !== ""),
  );
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
    if (!trimmed || hiddenNames.has(trimmed)) continue;
    const sections = sectionsByName.get(trimmed);
    if (!sections || sections.size < 2) continue;
    if (!value.section || !sections.has(value.section)) continue;
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
      const parsed = normalizeItemPreset(JSON.parse(raw));
      preset = parsed;
      // Persist renamed keys (Bacon (FROZEN) → Bacon) so old labels leave storage.
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
      } catch {
        // Ignore quota / private mode.
      }
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

/** Remember one product's storage, for example Pepperoni as chilled. Life is not saved. */
export function setProductDefault(
  name: string,
  partial: { section?: SectionId | null; life?: LifeKind | null },
) {
  hydrateItemPresetStore();
  const trimmed = canonicalProductName(name);
  if (!trimmed) return;
  const current = preset.defaults[trimmed] ?? { section: null, life: null };
  const section = partial.section !== undefined ? partial.section : current.section;
  const defaults = { ...preset.defaults };
  if (!section) delete defaults[trimmed];
  else defaults[trimmed] = { section, life: null };
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
