import {
  addDaysToIso,
  addHoursToLocal,
  endOfIsoDay,
  formatDateTime,
  formatLongDate,
  readExpiry,
} from "./dates";
import { splitPreppedAmbientFields } from "./storage-life";
import type { ShelfRule, StockStatus } from "./types";

export type Clock = {
  id: string;
  label: string;
  value: string;
  prompt: string;
  mode: "date" | "datetime" | "display";
  addDays?: number;
  addHours?: number;
  /**
   * Chart day lives count the start date as day 1.
   * Use-by is the start date plus `addDays - 1`.
   */
  inclusive?: boolean;
  cap?: boolean;
  /** Prepped/in-use life that applies while the product stays chilled. */
  chilled?: boolean;
};

export type ClockResult = {
  id: string;
  when: string;
  detail: string;
  tone: StockStatus;
  at: Date;
  caps: boolean;
};

function promptFor(label: string, kind: "date" | "time") {
  const key = label.toLowerCase();
  if (key === "12 hours") return "12 hours from";
  if (key.includes("delivery")) return "Delivered on";
  if (key.includes("ambient")) return kind === "time" ? "Ambient from" : "Ambient on";
  if (key.includes("in use")) return "In use from";
  if (key.includes("prepped") || key === "prepped") {
    return kind === "time" ? "Prepped at" : "Prepped on";
  }
  if (kind === "time") return "Start time";
  return "Start date";
}

function stripChilledWords(value: string) {
  return value
    .replace(/\(\s*chilled\s*\)/gi, "")
    .replace(/\bchilled\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withChilledDisplay(core: string) {
  return `${core} (Chilled)`;
}

function clockFromValue(
  id: string,
  label: string,
  value: string,
  options: { chilled?: boolean } = {},
): Clock {
  const raw = value.trim();
  const chilled = Boolean(options.chilled) || /\bchilled\b/i.test(raw);
  const trimmed = stripChilledWords(raw) || raw;
  const display = (core: string) => (chilled ? withChilledDisplay(core) : core);

  if (/^n\/a$/i.test(trimmed)) {
    return { id, label, value: trimmed, prompt: "", mode: "display", chilled };
  }
  if (/bb date on tray \+\s*1 day/i.test(trimmed)) {
    return {
      id,
      label,
      value: display(trimmed),
      prompt: "Date on the tray",
      mode: "date",
      addDays: 1,
      chilled,
    };
  }
  if (/bb date on pack/i.test(trimmed)) {
    return {
      id,
      label,
      value: display(trimmed),
      prompt: "BB date on the pack",
      mode: "date",
      cap: true,
      chilled,
    };
  }
  if (/date on pack/i.test(trimmed)) {
    return {
      id,
      label,
      value: display(trimmed),
      prompt: "Date on the pack",
      mode: "date",
      cap: true,
      chilled,
    };
  }
  if (/date on tray/i.test(trimmed)) {
    return {
      id,
      label,
      value: display(trimmed),
      prompt: "Date on the tray",
      mode: "date",
      cap: true,
      chilled,
    };
  }

  const days = trimmed.match(/(\d+)\s*days?/i);
  const hours = trimmed.match(/(\d+)\s*hours?/i);
  if (days && !hours) {
    return {
      id,
      label,
      value: display(`${days[1]} days`),
      prompt: promptFor(label, "date"),
      mode: "date",
      addDays: Number(days[1]),
      inclusive: true,
      chilled,
    };
  }
  if (hours && !days) {
    const n = Number(hours[1]);
    return {
      id,
      label,
      value: display(`${n} hours`),
      prompt: promptFor(label, "time"),
      mode: "datetime",
      addHours: n,
      chilled,
    };
  }
  return { id, label, value: display(trimmed), prompt: "", mode: "display", chilled };
}

/** Days to add on the calendar. Inclusive lives treat the start date as day 1. */
export function calendarDaysToAdd(clock: Clock) {
  if (clock.addDays == null) return null;
  if (clock.inclusive) return Math.max(0, clock.addDays - 1);
  return clock.addDays;
}

export function clocksFor(rule: ShelfRule): Clock[] {
  if (rule.unopened === "Date on tray" && rule.prepped === "BB date on tray +1 day") {
    return [
      clockFromValue("tray", "Use by", "BB date on tray +1 day"),
    ];
  }
  if (rule.prepped === "BB date on pack") {
    return [clockFromValue("bb", "BB date on the pack", "BB date on pack")];
  }

  // Divided prepped cells: "chilled" → prepped (chilled), "ambient" → ambient.
  const split = splitPreppedAmbientFields(rule.prepped, rule.ambientUse);

  // Ambient N/A means it cannot be stored ambient — omit that clock entirely.
  const ambient =
    split.ambientUse && !/^n\/a$/i.test(split.ambientUse.trim())
      ? split.ambientUse
      : undefined;

  const fields: [string, string, string | undefined][] = [
    ["delivery", "From delivery", rule.fromDelivery],
    ["use", "In use", rule.inUse],
    ["unopened", "Unopened", rule.unopened],
    ["prepped", "Prepped", split.prepped],
    ["ambient", "Ambient use", ambient],
    ["also", rule.also?.label ?? "Also", rule.also?.value],
  ];

  return fields
    .filter((field): field is [string, string, string] => Boolean(field[2]))
    .map(([id, label, value]) => {
      // "Chilled items" and "Chilled — ambient before use": once prepped, life is chilled.
      // True ambient-section products stay ambient. Ambient-use cells stay ambient.
      const chilledPrep =
        id !== "ambient" &&
        (rule.sectionId === "chilled" ||
          rule.sectionId === "ready" ||
          (id === "prepped" && /\bchilled\b/i.test(value))) &&
        (id === "prepped" || id === "use");
      return clockFromValue(id, label, value, { chilled: chilledPrep });
    });
}

export function projectClock(clock: Clock, raw: string, today: Date): ClockResult | null {
  const value = raw.trim();
  if (!value || clock.mode === "display") return null;

  if (clock.mode === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const offset = calendarDaysToAdd(clock);
    const iso = offset != null ? addDaysToIso(value, offset) : value;
    const readout = readExpiry(iso, today);
    const from = clock.addDays
      ? `From ${formatLongDate(value)}. ${readout.detail}.`
      : readout.detail;
    const at = endOfIsoDay(iso);
    const preppedDay = clock.id === "prepped" || clock.id === "use";
    return {
      id: clock.id,
      // Day-based prepped / in-use life ends at 23:59 on the use-by day.
      when: preppedDay ? formatDateTime(at) : formatLongDate(iso),
      detail: from,
      tone: readout.status,
      at,
      caps: clock.cap === true,
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const at = addHoursToLocal(value, clock.addHours ?? 0);
  const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  const readout = readExpiry(iso, today);
  const passed = at.getTime() < today.getTime();
  return {
    id: clock.id,
    when: formatDateTime(at),
    detail: passed ? "That time has passed" : readout.detail,
    tone: passed ? "expired" : readout.status,
    at,
    caps: false,
  };
}

export function capAdvice(results: ClockResult[]): string | null {
  const caps = results.filter((result) => result.caps);
  const others = results.filter((result) => !result.caps);
  if (caps.length === 0 || others.length === 0) return null;

  const cap = caps.reduce((best, result) => (result.at < best.at ? result : best));
  const other = others.reduce((best, result) => (result.at < best.at ? result : best));
  if (other.at.getTime() <= cap.at.getTime()) {
    return `Follow ${other.when}. That chart life ends before the date on the pack.`;
  }
  return `Follow ${cap.when}. The date on the pack is sooner than the chart life.`;
}
