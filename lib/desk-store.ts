import { EMPTY_PACK, parseChartPack } from "./chart-pack";
import { toIsoDate } from "./dates";
import type { ChartPack } from "./types";

const STORAGE_KEY = "shelf-life-desk-v1";

export type DeskState = {
  deliveryDate: string;
  pack: ChartPack;
  imported: boolean;
  sourceUrl: string;
};

const DEFAULT_STATE: DeskState = {
  deliveryDate: "",
  pack: EMPTY_PACK,
  imported: false,
  sourceUrl: "",
};

function todayIso() {
  return toIsoDate(new Date());
}

let state: DeskState = DEFAULT_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readStored(): DeskState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const data = JSON.parse(raw) as {
      deliveryDate?: string;
      sourceUrl?: string;
      pack?: unknown;
    };
    const deliveryDate =
      typeof data.deliveryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.deliveryDate)
        ? data.deliveryDate
        : "";
    const sourceUrl = typeof data.sourceUrl === "string" ? data.sourceUrl : "";
    if (data.pack) {
      const parsed = parseChartPack(data.pack);
      if (parsed.ok) {
        return {
          deliveryDate,
          pack: parsed.pack,
          imported: true,
          sourceUrl,
        };
      }
    }
    return { ...DEFAULT_STATE, deliveryDate, sourceUrl };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeStored(next: DeskState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        deliveryDate: next.deliveryDate,
        sourceUrl: next.sourceUrl,
        pack: next.imported ? next.pack : null,
      }),
    );
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function hydrateDeskStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = readStored();
  state = {
    ...stored,
    deliveryDate: todayIso(),
  };
  writeStored(state);
  emit();
}

export function getDeskState(): DeskState {
  return state;
}

export function subscribeDesk(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDeliveryDate(deliveryDate: string) {
  state = {
    ...state,
    deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ? deliveryDate : "",
  };
  writeStored(state);
  emit();
}

export function setImportedPack(pack: ChartPack, sourceUrl: string) {
  state = {
    ...state,
    pack,
    imported: true,
    sourceUrl,
  };
  writeStored(state);
  emit();
}

export function clearImportedPack() {
  state = {
    ...state,
    pack: EMPTY_PACK,
    imported: false,
    sourceUrl: "",
  };
  writeStored(state);
  emit();
}
