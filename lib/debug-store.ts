const DEBUG_KEY = "shelf-life-debug";
const DEBUG_DAYS_KEY = "shelf-life-debug-days";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

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
  emit();
}

/** Show day counts instead of use-by dates in the list and tickets. */
export function readDebugDays() {
  try {
    return window.localStorage.getItem(DEBUG_DAYS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDebugDays(on: boolean) {
  try {
    window.localStorage.setItem(DEBUG_DAYS_KEY, on ? "1" : "0");
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}
