const STORAGE_KEY = "text-size-v1";

export type TextSize = "sm" | "md" | "lg";

/** Default medium — matches the browser root (16px). */
export const DEFAULT_TEXT_SIZE: TextSize = "md";

export const TEXT_SIZE_OPTIONS: ReadonlyArray<{
  id: TextSize;
  label: string;
}> = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

let size: TextSize = DEFAULT_TEXT_SIZE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function parseSize(raw: string | null): TextSize | null {
  if (raw === "sm" || raw === "md" || raw === "lg") return raw;
  return null;
}

export function hydrateTextSizeStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const next = parseSize(window.localStorage.getItem(STORAGE_KEY));
    if (next) size = next;
  } catch {
    // Keep default.
  }
}

export function getTextSize(): TextSize {
  return size;
}

export function getTextSizeServer(): TextSize {
  return DEFAULT_TEXT_SIZE;
}

export function setTextSize(next: TextSize) {
  size = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}

export function subscribeTextSize(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
