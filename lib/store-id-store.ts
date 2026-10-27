const STORAGE_KEY = "store-id-v1";

/** Digits only, so a pasted "12 345" still saves as 12345. Empty clears it. */
export function normalizeStoreId(raw: string): string | null {
  const compact = raw.trim().replace(/\s+/g, "");
  if (!compact) return "";
  if (!/^\d{1,8}$/.test(compact)) return null;
  return compact;
}

let storeId = "";
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function hydrateStoreIdStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const next = normalizeStoreId(window.localStorage.getItem(STORAGE_KEY) ?? "");
    if (next) storeId = next;
  } catch {
    // Keep unset.
  }
}

export function getStoreId(): string {
  return storeId;
}

export function getStoreIdServer(): string {
  return "";
}

export function setStoreId(next: string) {
  const normalized = normalizeStoreId(next);
  if (normalized == null) return;
  storeId = normalized;
  try {
    if (storeId) window.localStorage.setItem(STORAGE_KEY, storeId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}

export function subscribeStoreId(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
