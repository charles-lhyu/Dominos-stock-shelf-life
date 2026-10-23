import { toIsoDate } from "./dates";
import { buildSampleBook } from "./sample";
import { BEEP_KEY, loadBook, saveBook } from "./storage";
import type { StockBook } from "./types";

export type DeskSnapshot = {
  book: StockBook;
  beepOn: boolean;
  todayIso: string;
};

let snapshot: DeskSnapshot | null = null;
const listeners = new Set<() => void>();

function boot(): DeskSnapshot {
  if (snapshot) return snapshot;
  const stored = loadBook();
  const book = stored ?? buildSampleBook(new Date());
  if (!stored) saveBook(book);
  snapshot = {
    book,
    beepOn: localStorage.getItem(BEEP_KEY) !== "0",
    todayIso: toIsoDate(new Date()),
  };
  return snapshot;
}

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeDesk(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDeskSnapshot(): DeskSnapshot {
  return boot();
}

export function getDeskServerSnapshot(): DeskSnapshot | null {
  return null;
}

export function commitBook(book: StockBook): boolean {
  try {
    saveBook(book);
  } catch {
    return false;
  }
  snapshot = { ...boot(), book };
  emit();
  return true;
}

export function commitBeep(beepOn: boolean) {
  localStorage.setItem(BEEP_KEY, beepOn ? "1" : "0");
  snapshot = { ...boot(), beepOn };
  emit();
}
