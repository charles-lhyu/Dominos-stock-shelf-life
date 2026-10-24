import { BUNDLED_PACK, EMPTY_PACK, parseChartPack } from "./chart-pack";
import { addDaysIso, toIsoDate } from "./dates";
import type { ChartPack, ShelfRule } from "./types";

const STORAGE_KEY = "shelf-life-desk-v1";

/** Sample Campaign 5 chart for `next dev`, marked expired so update prompts show. */
const PREVIEW_PACK: ChartPack =
  process.env.NODE_ENV === "development"
    ? {
        ...BUNDLED_PACK,
        chart: {
          ...BUNDLED_PACK.chart,
          // Yesterday — past valid-until so Settings / collapsed update cues preview.
          validUntil: addDaysIso(new Date(), -1),
        },
      }
    : EMPTY_PACK;

export type DeskState = {
  deliveryDate: string;
  /** Locked prep time `HH:MM`; empty means live clock. */
  prepTime: string;
  pack: ChartPack;
  imported: boolean;
  sourceUrl: string;
};

const DEFAULT_STATE: DeskState = {
  deliveryDate: "",
  prepTime: "",
  pack: PREVIEW_PACK,
  imported: false,
  sourceUrl: "",
};

/**
 * Older imports copied the previous row's life onto the next product.
 * Pineapple and Olives are 10 days. Pepperdew is 25 days.
 * Leave every other stored life alone.
 */
export function repairStoredRules(rules: ShelfRule[]): ShelfRule[] {
  return rules.map((rule) => {
    if (rule.sectionId !== "ready" || !rule.prepped) return rule;
    if ((rule.name === "Pineapple" || rule.name === "Olives") && rule.prepped === "25 days") {
      return { ...rule, prepped: "10 days" };
    }
    if (
      rule.name === "Pepperdew Piquante Peppers" &&
      /^\d+ days$/.test(rule.prepped) &&
      rule.prepped !== "25 days"
    ) {
      return { ...rule, prepped: "25 days" };
    }
    return rule;
  });
}

function repairPack(pack: ChartPack): ChartPack {
  const rules = repairStoredRules(pack.rules);
  if (rules.every((rule, index) => rule === pack.rules[index])) return pack;
  return { ...pack, rules };
}

function isPrepTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

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
      prepTime?: string;
      sourceUrl?: string;
      pack?: unknown;
    };
    const deliveryDate =
      typeof data.deliveryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.deliveryDate)
        ? data.deliveryDate
        : "";
    const prepTime = isPrepTime(data.prepTime) ? data.prepTime : "";
    const sourceUrl = typeof data.sourceUrl === "string" ? data.sourceUrl : "";
    if (data.pack) {
      const parsed = parseChartPack(data.pack);
      if (parsed.ok) {
        return {
          deliveryDate,
          prepTime,
          pack: repairPack(parsed.pack),
          imported: true,
          sourceUrl,
        };
      }
    }
    return { ...DEFAULT_STATE, deliveryDate, prepTime, sourceUrl };
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
        prepTime: next.prepTime || null,
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

/** Set a locked prep time (`HH:MM`), or `""` to unlock and resume the live clock. */
export function setPrepTime(prepTime: string) {
  state = {
    ...state,
    prepTime: isPrepTime(prepTime) ? prepTime : "",
  };
  writeStored(state);
  emit();
}

export function setImportedPack(pack: ChartPack, sourceUrl: string) {
  state = {
    ...state,
    pack: repairPack(pack),
    imported: true,
    sourceUrl,
  };
  writeStored(state);
  emit();
}

export function clearImportedPack() {
  state = {
    ...state,
    pack: PREVIEW_PACK,
    imported: false,
    sourceUrl: "",
  };
  writeStored(state);
  emit();
}
