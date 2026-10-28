import { canonicalProductName, migrateProductNames } from "./chart-name-migrate";

const STORAGE_KEY = "shelf-life-hidden-names";
const listeners = new Set<() => void>();
/** Stable empty list for useSyncExternalStore getServerSnapshot. */
export const EMPTY_HIDDEN_NAMES: string[] = [];

function readNames(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const before = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item !== "")
      .sort((a, b) => a.localeCompare(b));
    const migrated = migrateProductNames(before);
    if (
      before.length !== migrated.length ||
      before.some((item, index) => item !== migrated[index])
    ) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        // Ignore quota / private mode.
      }
    }
    return migrated;
  } catch {
    return [];
  }
}

function writeNames(names: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // Ignore quota / private mode.
  }
  for (const listener of listeners) listener();
}

let cached: string[] | null = null;

function names(): string[] {
  if (cached == null) cached = readNames();
  return cached;
}

export function subscribeHidden(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHiddenNames(): string[] {
  return names();
}

export function getHiddenNamesServer(): string[] {
  return EMPTY_HIDDEN_NAMES;
}

export function isNameHidden(name: string): boolean {
  return names().includes(canonicalProductName(name));
}

export function hideProductName(name: string) {
  const trimmed = canonicalProductName(name);
  if (!trimmed) return;
  const next = names();
  if (next.includes(trimmed)) return;
  cached = [...next, trimmed].sort((a, b) => a.localeCompare(b));
  writeNames(cached);
}

export function unhideProductName(name: string) {
  const trimmed = canonicalProductName(name);
  cached = names().filter((item) => item !== trimmed);
  writeNames(cached);
}

export function clearHiddenNames() {
  cached = [];
  writeNames(cached);
}

export function replaceHiddenNames(next: string[]) {
  const cleaned = migrateProductNames(
    next.filter((item) => typeof item === "string").map((item) => item.trim()),
  );
  const current = names();
  if (current.length === cleaned.length && current.every((item, index) => item === cleaned[index])) {
    return;
  }
  cached = cleaned;
  writeNames(cached);
}
