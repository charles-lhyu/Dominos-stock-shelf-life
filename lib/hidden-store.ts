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

function writeEntries(next: HiddenEntry[]) {
  cached = next;
  cachedNames = hiddenNamesFromEntries(next);
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(serializeHiddenEntries(next)),
    );
  } catch {
    // Ignore quota / private mode.
  }
  for (const listener of listeners) listener();
}

let cached: HiddenEntry[] | null = null;
/** Stable snapshot for useSyncExternalStore — never allocate in getSnapshot. */
let cachedNames: string[] | null = null;

function entries(): HiddenEntry[] {
  if (cached == null) {
    cached = readEntries();
    cachedNames = hiddenNamesFromEntries(cached);
  }
  return cached;
}

function names(): string[] {
  if (cachedNames == null) {
    cachedNames = hiddenNamesFromEntries(entries());
  }
  return cachedNames;
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
  return names();
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
  writeEntries(addHiddenEntry(entries(), name, null));
}

/** Hide one storage for a multi-storage product. */
export function hideProductSection(name: string, section: SectionId) {
  writeEntries(addHiddenEntry(entries(), name, section));
}

export function unhideProductName(name: string) {
  writeEntries(removeHiddenEntry(entries(), name));
}

export function unhideProductSection(name: string, section: SectionId | null) {
  writeEntries(removeHiddenEntry(entries(), name, section));
}

export function unhideByKey(key: string) {
  writeEntries(removeHiddenByKey(entries(), key));
}

export function clearHiddenNames() {
  writeEntries([]);
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
  writeEntries(cleaned);
}

export { formatHiddenLabel, hiddenEntryKey };
export type { HiddenEntry };
