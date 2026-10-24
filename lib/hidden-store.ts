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
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
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
  return names().includes(name);
}

export function hideProductName(name: string) {
  const next = names();
  if (next.includes(name)) return;
  cached = [...next, name].sort((a, b) => a.localeCompare(b));
  writeNames(cached);
}

export function unhideProductName(name: string) {
  cached = names().filter((item) => item !== name);
  writeNames(cached);
}

export function clearHiddenNames() {
  cached = [];
  writeNames(cached);
}
