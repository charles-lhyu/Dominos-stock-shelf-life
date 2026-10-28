import {
  addHiddenEntry,
  formatHiddenLabel,
  hiddenEntryKey,
  hiddenNamesFromEntries,
  isProductHidden,
  isSectionHidden,
  parseHiddenEntries,
  removeHiddenByKey,
  removeHiddenEntry,
  serializeHiddenEntries,
  type HiddenEntry,
} from "./hidden-entries";
import type { SectionId } from "./types";

const STORAGE_KEY = "shelf-life-hidden-names";
const listeners = new Set<() => void>();
/** Stable empty list for useSyncExternalStore getServerSnapshot. */
export const EMPTY_HIDDEN_NAMES: string[] = [];
export const EMPTY_HIDDEN_ENTRIES: HiddenEntry[] = [];

function readEntries(): HiddenEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = parseHiddenEntries(JSON.parse(raw) as unknown);
    // Persist migrated shape (Bacon (FROZEN) → Bacon + frozen, etc.).
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeHiddenEntries(parsed)));
    } catch {
      // Ignore quota / private mode.
    }
    return parsed;
  } catch {
    return [];
  }
}

function writeEntries(entries: HiddenEntry[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(serializeHiddenEntries(entries)),
    );
  } catch {
    // Ignore quota / private mode.
  }
  for (const listener of listeners) listener();
}

let cached: HiddenEntry[] | null = null;

function entries(): HiddenEntry[] {
  if (cached == null) cached = readEntries();
  return cached;
}

export function subscribeHidden(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHiddenEntries(): HiddenEntry[] {
  return entries();
}

export function getHiddenEntriesServer(): HiddenEntry[] {
  return EMPTY_HIDDEN_ENTRIES;
}

/** Product names that have at least one hidden storage (for counts / legacy callers). */
export function getHiddenNames(): string[] {
  return hiddenNamesFromEntries(entries());
}

export function getHiddenNamesServer(): string[] {
  return EMPTY_HIDDEN_NAMES;
}

export function isNameHidden(name: string): boolean {
  return getHiddenNames().includes(name.trim()) || isProductHidden(entries(), name, []);
}

export function isHiddenSection(name: string, section: SectionId): boolean {
  return isSectionHidden(entries(), name, section);
}

export function isHiddenProduct(name: string, sections: Iterable<SectionId>): boolean {
  return isProductHidden(entries(), name, sections);
}

/** Hide every storage for this product. */
export function hideProductName(name: string) {
  const next = addHiddenEntry(entries(), name, null);
  cached = next;
  writeEntries(cached);
}

/** Hide one storage for a multi-storage product. */
export function hideProductSection(name: string, section: SectionId) {
  const next = addHiddenEntry(entries(), name, section);
  cached = next;
  writeEntries(cached);
}

export function unhideProductName(name: string) {
  cached = removeHiddenEntry(entries(), name);
  writeEntries(cached);
}

export function unhideProductSection(name: string, section: SectionId | null) {
  cached = removeHiddenEntry(entries(), name, section);
  writeEntries(cached);
}

export function unhideByKey(key: string) {
  cached = removeHiddenByKey(entries(), key);
  writeEntries(cached);
}

export function clearHiddenNames() {
  cached = [];
  writeEntries(cached);
}

export function replaceHiddenNames(next: unknown) {
  const cleaned = parseHiddenEntries(next);
  const current = entries();
  if (
    current.length === cleaned.length &&
    current.every((item, index) => hiddenEntryKey(item) === hiddenEntryKey(cleaned[index]!))
  ) {
    return;
  }
  cached = cleaned;
  writeEntries(cached);
}

export { formatHiddenLabel, hiddenEntryKey };
export type { HiddenEntry };
