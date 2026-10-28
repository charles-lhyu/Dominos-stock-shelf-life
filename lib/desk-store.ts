import { BUNDLED_PACK, EMPTY_PACK, parseChartPack } from "./chart-pack";
import { CHART_PRODUCT_RENAMES } from "./chart-name-migrate";
import { toIsoDate } from "./dates";
import type { ChartPack, ShelfRule } from "./types";

const STORAGE_KEY = "shelf-life-desk-v1";

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
  pack: EMPTY_PACK,
  imported: false,
  sourceUrl: "",
};

/**
 * Older imports copied the previous row's life onto the next product.
 * Pineapple and Olives are 10 days. Pepperdew is 25 days. Sliced gherkins are 16 days.
 * Leave every other stored life alone.
 * Categories follow the Campaign 5 chart Category column. Mac n Cheese is Sides.
 * Dough is Dough. Biscoff crumb is Toppings. Pack-dated products are Other.
 * A saved pack with the wrong heading is put back on load.
 */
function withChartCategory(rule: ShelfRule): ShelfRule {
  const bundled = BUNDLED_PACK.rules.find(
    (item) => item.name === rule.name && item.sectionId === rule.sectionId,
  );
  if (!bundled || bundled.category === rule.category) return rule;
  return { ...rule, category: bundled.category };
}

function withChartDisplayName(rule: ShelfRule): ShelfRule {
  const rename = CHART_PRODUCT_RENAMES[rule.name];
  let next = rule;
  if (rename && (!rename.sectionId || rename.sectionId === rule.sectionId)) {
    const idSlug = rename.name
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    next = {
      ...rule,
      name: rename.name,
      id: `${rule.sectionId}:${idSlug}`,
    };
  }
  const bundled = BUNDLED_PACK.rules.find(
    (item) => item.name === next.name && item.sectionId === next.sectionId,
  );
  if (bundled?.tags?.length) {
    next = { ...next, tags: [...bundled.tags] };
  } else if (next.tags?.length) {
    next = { ...next, tags: undefined };
  }
  // Only fill aliases when we renamed a chart label into the clean title.
  if (rename && bundled?.aliases?.length) {
    next = {
      ...next,
      aliases: [...new Set([...next.aliases, ...bundled.aliases])],
    };
  }
  return next;
}

/**
 * Drop fields we invented that are not on the Campaign chart:
 * - chilled Chorizo / Nduja (frozen-only on the chart)
 * - inUse copied onto a row that still has no in-use column on the bundled chart
 */
function withoutInventedFields(rule: ShelfRule): ShelfRule | null {
  if (
    rule.sectionId === "chilled" &&
    (rule.name === "Chorizo" || rule.name === "Nduja Sausage")
  ) {
    return null;
  }
  const bundled = BUNDLED_PACK.rules.find(
    (item) => item.name === rule.name && item.sectionId === rule.sectionId,
  );
  if (
    bundled &&
    !bundled.inUse &&
    rule.inUse &&
    rule.fromDelivery &&
    rule.inUse === rule.fromDelivery &&
    /^\d+\s*days?$/i.test(rule.inUse)
  ) {
    const next = { ...rule };
    delete next.inUse;
    return next;
  }
  return rule;
}

/** Fill a missing in-use life when the bundled chart row has a spanned cell. */
function withSpannedInUse(rule: ShelfRule): ShelfRule {
  if (rule.inUse) return rule;
  const bundled = BUNDLED_PACK.rules.find(
    (item) => item.name === rule.name && item.sectionId === rule.sectionId,
  );
  if (!bundled?.inUse || !bundled.fromDelivery) return rule;
  const deliveryN = bundled.fromDelivery.match(/^(\d+)\s*days?\b/i)?.[1];
  const useN = bundled.inUse.match(/^(\d+)\s*days?\b/i)?.[1];
  // Same day count spans both columns — keep the saved delivery count on in-use.
  if (deliveryN && useN && deliveryN === useN && rule.fromDelivery) {
    return { ...rule, inUse: rule.fromDelivery };
  }
  return { ...rule, inUse: bundled.inUse };
}

export function repairStoredRules(rules: ShelfRule[]): ShelfRule[] {
  const repaired: ShelfRule[] = [];
  for (const rule of rules) {
    const stripped = withoutInventedFields(withChartCategory(withChartDisplayName(rule)));
    if (!stripped) continue;
    const current = withSpannedInUse(stripped);
    if (current.sectionId !== "ready" || !current.prepped) {
      repaired.push(current);
      continue;
    }
    if ((current.name === "Pineapple" || current.name === "Olives") && current.prepped === "25 days") {
      repaired.push({ ...current, prepped: "10 days" });
      continue;
    }
    if (
      current.name === "Pepperdew Piquante Peppers" &&
      /^\d+ days$/.test(current.prepped) &&
      current.prepped !== "25 days"
    ) {
      repaired.push({ ...current, prepped: "25 days" });
      continue;
    }
    if (
      current.name === "Sliced Gherkins" &&
      /^\d+ days$/.test(current.prepped) &&
      current.prepped !== "16 days"
    ) {
      repaired.push({ ...current, prepped: "16 days" });
      continue;
    }
    repaired.push(current);
  }
  return repaired;
}

function repairChartMeta(pack: ChartPack): ChartPack["chart"] {
  const base = BUNDLED_PACK.chart;
  const chart = pack.chart;
  return {
    title: chart.title?.trim() || base.title,
    audience: chart.audience?.trim() || base.audience,
    version: chart.version?.trim() || base.version,
    issued: chart.issued?.trim() || base.issued,
    validUntil: chart.validUntil?.trim() || base.validUntil,
  };
}

function repairPack(pack: ChartPack): ChartPack {
  const rules = repairStoredRules(pack.rules);
  const chart = repairChartMeta(pack);
  const rulesChanged = rules.some((rule, index) => rule !== pack.rules[index]);
  const chartChanged =
    chart.title !== pack.chart.title ||
    chart.audience !== pack.chart.audience ||
    chart.version !== pack.chart.version ||
    chart.issued !== pack.chart.issued ||
    chart.validUntil !== pack.chart.validUntil;
  if (!rulesChanged && !chartChanged) return pack;
  return { ...pack, chart, rules };
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
let afterImport: ((pack: ChartPack, sourceUrl: string) => void) | null = null;
let afterClear: (() => void) | null = null;

export function onPackImported(listener: (pack: ChartPack, sourceUrl: string) => void) {
  afterImport = listener;
}

export function onPackCleared(listener: () => void) {
  afterClear = listener;
}

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

function packForStorage(pack: ChartPack): ChartPack {
  return {
    ...pack,
    rules: pack.rules.map(({ pdfCropImage: _image, ...rule }) => rule),
  };
}

function writeStored(next: DeskState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        deliveryDate: next.deliveryDate,
        prepTime: next.prepTime || null,
        sourceUrl: next.sourceUrl,
        pack: next.imported ? packForStorage(next.pack) : null,
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
  afterImport?.(state.pack, state.sourceUrl);
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
  afterClear?.();
  emit();
}
