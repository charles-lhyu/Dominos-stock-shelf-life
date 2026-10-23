import { toIsoDate } from "./dates";

let todayIso: string | null = null;
const listeners = new Set<() => void>();

export function subscribeToday(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTodayIso(): string {
  if (!todayIso) todayIso = toIsoDate(new Date());
  return todayIso;
}

export function getServerToday(): null {
  return null;
}
