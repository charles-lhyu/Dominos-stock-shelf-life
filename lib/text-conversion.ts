import { sectionFromPack } from "./chart-pack";
import { clocksFor, projectClock, type Clock } from "./life";
import { clockStartValue, isPrintedPackDate } from "./preview";
import type { ChartPack, ShelfRule } from "./types";

export type TextConversionRow = {
  name: string;
  section: string;
  field: string;
  text: string;
  useBy: string;
};

function sourceText(rule: ShelfRule, clock: Clock) {
  if (clock.id === "delivery") return rule.fromDelivery;
  if (clock.id === "use") return rule.inUse;
  if (clock.id === "unopened") return rule.unopened;
  if (clock.id === "ambient") return rule.ambientUse;
  if (clock.id === "also") return rule.also?.value;
  return rule.prepped;
}

function printedUseBy(clock: Clock) {
  if (/bb date/i.test(clock.prompt)) return "BB date on the pack";
  if (/tray/i.test(clock.prompt)) return "On the tray";
  return "On the pack";
}

function useByFor(clock: Clock, deliveryDate: string, prepTime: string, today: Date) {
  if (clock.mode === "display") {
    return /^n\/a$/i.test(clock.value) ? "—" : clock.value;
  }
  if (isPrintedPackDate(clock)) return printedUseBy(clock);
  if (!deliveryDate) return "Set a date";
  const result = projectClock(clock, clockStartValue(clock, deliveryDate, prepTime, today), today);
  return result?.when ?? clock.value;
}

/**
 * Every life string on the imported chart, converted with the current Delivery/Prep Date.
 * Printed pack dates stay on the pack. Day counts are the full number of days.
 * Hour clocks start at the locked prep time, or at `today` when that time is live.
 */
export function textConversionTable(
  pack: ChartPack,
  deliveryDate: string,
  prepTime: string,
  today: Date,
): TextConversionRow[] {
  const rows: TextConversionRow[] = [];
  for (const rule of pack.rules) {
    const section = sectionFromPack(pack, rule.sectionId).short;
    for (const clock of clocksFor(rule)) {
      rows.push({
        name: rule.name,
        section,
        field: clock.label,
        text: sourceText(rule, clock) ?? clock.value,
        useBy: useByFor(clock, deliveryDate, prepTime, today),
      });
    }
  }
  return rows;
}
