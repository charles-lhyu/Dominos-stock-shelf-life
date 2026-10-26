const STORAGE_KEY = "keep-awake-v1";

/** Default on — kitchen desk should not dim while in use. */
export const DEFAULT_KEEP_AWAKE = true;

let enabled = DEFAULT_KEEP_AWAKE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function hydrateKeepAwakeStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "0" || raw === "false") enabled = false;
    else if (raw === "1" || raw === "true") enabled = true;
  } catch {
    // Keep default.
  }
}

export function getKeepAwake(): boolean {
  return enabled;
}

export function getKeepAwakeServer(): boolean {
  return DEFAULT_KEEP_AWAKE;
}

export function setKeepAwake(next: boolean) {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}

export function subscribeKeepAwake(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
