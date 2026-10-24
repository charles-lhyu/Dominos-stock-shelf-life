const DEBUG_KEY = "shelf-life-debug";
const listeners = new Set<() => void>();

export function subscribeDebug(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readDebug() {
  try {
    return window.localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDebug(on: boolean) {
  try {
    window.localStorage.setItem(DEBUG_KEY, on ? "1" : "0");
  } catch {
    // Ignore quota / private mode.
  }
  for (const listener of listeners) listener();
}
