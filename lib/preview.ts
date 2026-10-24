import { sectionFromPack } from "./chart-pack";
import { clocksFor, projectClock, type Clock } from "./life";
import type { ChartPack, SectionId, ShelfRule, StockStatus } from "./types";

export type LifeKind = "stock" | "prepped" | "ambient";

export type ItemVariant = {
  rule: ShelfRule;
  sectionId: SectionId;
  short: string;
  tag: string;
};

export const SECTION_ORDER: SectionId[] = ["frozen", "chilled", "ready", "ambient", "pack"];

/** Storage filter chips — ready rolls into Ambient. */
export const FILTER_SECTIONS: SectionId[] = ["frozen", "chilled", "ambient", "pack"];

export const SECTION_TAG: Record<SectionId, string> = {
  frozen: "Frozen",
  chilled: "Chilled",
  ready: "Ambient",
  ambient: "Ambient",
  pack: "On pack",
};

export function sectionMatchesFilter(sectionId: SectionId, filter: SectionId | "all") {
  if (filter === "all") return true;
  if (filter === "ambient") return sectionId === "ambient" || sectionId === "ready";
  return sectionId === filter;
}

export const LIFE_KINDS: LifeKind[] = ["stock", "prepped", "ambient"];

export const LIFE_KIND_META: Record<
  LifeKind,
  { tag: string; filter: string; clockIds: string[] }
> = {
  stock: {
    tag: "Delivery",
    filter: "Delivery",
    clockIds: ["delivery", "unopened", "tray", "bb"],
  },
  prepped: {
    tag: "Prepped",
    filter: "Prepped",
    clockIds: ["use", "prepped", "also"],
  },
  ambient: {
    tag: "Ambient",
    filter: "Ambient",
    clockIds: ["ambient"],
  },
};

export type DatePreview = {
  when: string;
  detail: string;
  tone: StockStatus | "neutral";
  life: string;
  kind: LifeKind | null;
  /** Present when the preview is a calculated use-by (supports format toggle). */
  at?: Date;
};

function clockKind(clock: Clock): LifeKind | null {
  for (const kind of LIFE_KINDS) {
    if (LIFE_KIND_META[kind].clockIds.includes(clock.id)) return kind;
  }
  return null;
}

export function clocksForLifeKind(rule: ShelfRule, kind: LifeKind): Clock[] {
  return clocksFor(rule).filter((clock) => LIFE_KIND_META[kind].clockIds.includes(clock.id));
}

export function lifeKindsForRule(rule: ShelfRule): LifeKind[] {
  const present = new Set<LifeKind>();
  for (const clock of clocksFor(rule)) {
    const kind = clockKind(clock);
    if (kind) present.add(kind);
  }
  return LIFE_KINDS.filter((kind) => present.has(kind));
}

export function pickLifeKind(kinds: LifeKind[], preferred: LifeKind | null): LifeKind | null {
  if (kinds.length === 0) return null;
  if (preferred && kinds.includes(preferred)) return preferred;
  return kinds[0] ?? null;
}

/**
 * Life to show before the user picks Delivery, Prepped, or Ambient.
 * "Date on pack" is not a use-by you can work out from the prep date, so
 * gherkins and the other ready toppings show their prepped life instead.
 */
export function calculatedLifeKind(rule: ShelfRule): LifeKind | null {
  for (const kind of LIFE_KINDS) {
    const clocks = clocksForLifeKind(rule, kind);
    if (clocks.some((clock) => clock.addDays != null || clock.addHours != null)) return kind;
  }
  return lifeKindsForRule(rule)[0] ?? null;
}

export function categoriesInPack(pack: ChartPack): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const rule of pack.rules) {
    if (seen.has(rule.category)) continue;
    seen.add(rule.category);
    order.push(rule.category);
  }
  return order;
}

export function variantsForName(name: string, rules: ShelfRule[], pack: ChartPack): ItemVariant[] {
  const matches = rules.filter((rule) => rule.name === name);
  const bySection = new Map<SectionId, ShelfRule>();
  for (const rule of matches) {
    if (!bySection.has(rule.sectionId)) bySection.set(rule.sectionId, rule);
  }
  return SECTION_ORDER.filter((id) => bySection.has(id)).map((sectionId) => {
    const rule = bySection.get(sectionId)!;
    return {
      rule,
      sectionId,
      short: sectionFromPack(pack, sectionId).short,
      tag: SECTION_TAG[sectionId],
    };
  });
}

/** Within Toppings: meats first, then veg, then everything else. */
export type ToppingGroup = "meats" | "veg" | "other";

const MEAT_NAME =
  /pepperoni|chorizo|nduja|bacon|\bham\b|chicken|beef|sausage|meatball|hot\s*dogs?|tuna|pork|turkey|salami|anchov/i;
const VEG_NAME =
  /chill(?:i|y|ies)|mushrooms?|\bonions?\b|peppers?\b|tomatoes?|gherkins?|sweet\s*corn|jalape?[nñ]os?|pineapple|olives?|pepperdew|spinach|rocket|\bcorn\b|cucumber|pickles?/i;

export function toppingGroup(name: string): ToppingGroup {
  if (MEAT_NAME.test(name)) return "meats";
  if (VEG_NAME.test(name)) return "veg";
  return "other";
}

const TOPPING_GROUP_ORDER: Record<ToppingGroup, number> = {
  meats: 0,
  veg: 1,
  other: 2,
};

/** Unique product counts per storage filter chip (ready counted under Ambient). */
export function sectionNameCounts(
  rules: ShelfRule[],
  category: string | "all",
): { all: number; bySection: Record<SectionId, number> } {
  const all = new Set<string>();
  const bySection = Object.fromEntries(FILTER_SECTIONS.map((id) => [id, new Set<string>()])) as Record<
    SectionId,
    Set<string>
  >;

  for (const rule of rules) {
    if (category !== "all" && rule.category !== category) continue;
    all.add(rule.name);
    const bucket: SectionId = rule.sectionId === "ready" ? "ambient" : rule.sectionId;
    bySection[bucket]?.add(rule.name);
  }

  return {
    all: all.size,
    bySection: Object.fromEntries(
      FILTER_SECTIONS.map((id) => [id, bySection[id]?.size ?? 0]),
    ) as Record<SectionId, number>,
  };
}

export function uniqueNamesInCategory(rules: ShelfRule[], category: string | "all"): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (category !== "all" && rule.category !== category) continue;
    if (seen.has(rule.name)) continue;
    seen.add(rule.name);
    names.push(rule.name);
  }
  if (category === "Toppings") {
    names.sort(
      (a, b) => TOPPING_GROUP_ORDER[toppingGroup(a)] - TOPPING_GROUP_ORDER[toppingGroup(b)],
    );
  }
  return names;
}

export function pickVariant(
  variants: ItemVariant[],
  preferred: SectionId | null,
): ItemVariant | null {
  if (variants.length === 0) return null;
  if (preferred) {
    const match = variants.find((item) => item.sectionId === preferred);
    if (match) return match;
  }
  return variants[0] ?? null;
}

/** Printed pack/tray dates are not calculated from the delivery date. */
export function isPrintedPackDate(clock: Clock) {
  return clock.mode === "date" && clock.cap === true && clock.addDays == null;
}

/** Locked `HH:MM`, or the clock time on `today` when prep time is live. */
export function prepClockTime(prepTime: string, today: Date) {
  if (/^\d{2}:\d{2}$/.test(prepTime)) return prepTime;
  const hours = String(today.getHours()).padStart(2, "0");
  const minutes = String(today.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Day clocks start on the delivery/prep date. Hour clocks start at the prep time. */
export function clockStartValue(
  clock: Clock,
  deliveryDate: string,
  prepTime: string,
  today: Date,
) {
  if (clock.mode === "datetime") return `${deliveryDate}T${prepClockTime(prepTime, today)}`;
  return deliveryDate;
}

function projectWithDelivery(clock: Clock, deliveryDate: string, today: Date, prepTime: string) {
  return projectClock(clock, clockStartValue(clock, deliveryDate, prepTime, today), today);
}

export function datePreview(
  rule: ShelfRule,
  deliveryDate: string,
  preferredKind: LifeKind | null = null,
  today?: Date | null,
  prepTime = "",
): DatePreview {
  const kinds = lifeKindsForRule(rule);
  const kind = pickLifeKind(kinds, preferredKind);
  const clocks = kind ? clocksForLifeKind(rule, kind) : clocksFor(rule);
  const life = clocks.map((clock) => clock.value).filter(Boolean).join(" · ") || "See chart";

  const printed = clocks.find(isPrintedPackDate);
  const preferred =
    clocks.find((clock) => clock.id === "delivery" && clock.mode === "date") ??
    clocks.find((clock) => clock.mode === "date" && clock.addDays != null) ??
    clocks.find((clock) => clock.mode === "datetime");

  if (preferred && deliveryDate && today) {
    const result = projectWithDelivery(preferred, deliveryDate, today, prepTime);
    if (result) {
      return {
        when: result.when,
        detail: result.detail,
        tone: result.tone,
        life,
        kind,
        at: result.at,
      };
    }
  }

  if (preferred && deliveryDate && !today) {
    return {
      when: preferred.value,
      detail: "Calculating from the delivery date…",
      tone: "neutral",
      life,
      kind,
    };
  }

  if (printed) {
    return {
      when: printed.value,
      detail: "Use the date printed on the pack",
      tone: "neutral",
      life,
      kind,
    };
  }

  if (!deliveryDate) {
    return {
      when: "Set a date above",
      detail: "Dates use the delivery date at the top.",
      tone: "neutral",
      life,
      kind,
    };
  }

  const display = clocks.find((clock) => clock.mode === "display") ?? clocks[0];
  return {
    when: display?.value ?? "On pack",
    detail: display?.label ?? "Follow the pack date",
    tone: "neutral",
    life,
    kind,
  };
}
