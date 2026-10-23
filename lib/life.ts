import {
  addDaysToIso,
  addHoursToLocal,
  endOfIsoDay,
  formatDateTime,
  formatLongDate,
  readExpiry,
} from "./dates";
import type { ShelfRule, StockStatus } from "./types";

export type Clock = {
  id: string;
  label: string;
  value: string;
  prompt: string;
  mode: "date" | "datetime" | "display";
  addDays?: number;
  addHours?: number;
  cap?: boolean;
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

function clockFromValue(id: string, label: string, value: string): Clock {
  const trimmed = value.trim();
  if (/^n\/a$/i.test(trimmed)) {
    return { id, label, value: trimmed, prompt: "", mode: "display" };
  }
  if (/bb date on tray \+\s*1 day/i.test(trimmed)) {
    return {
      id,
      label,
      value: trimmed,
      prompt: "Date on the tray",
      mode: "date",
      addDays: 1,
    };
  }
  if (/bb date on pack/i.test(trimmed)) {
    return {
      id,
      label,
      value: trimmed,
      prompt: "BB date on the pack",
      mode: "date",
      cap: true,
    };
  }
  if (/date on pack/i.test(trimmed)) {
    return {
      id,
      label,
      value: trimmed,
      prompt: "Date on the pack",
      mode: "date",
      cap: true,
    };
  }
  if (/date on tray/i.test(trimmed)) {
    return {
      id,
      label,
      value: trimmed,
      prompt: "Date on the tray",
      mode: "date",
      cap: true,
    };
  }

  const days = trimmed.match(/(\d+)\s*days?/i);
  const hours = trimmed.match(/(\d+)\s*hours?/i);
  if (days && !hours) {
    return {
      id,
      label,
      value: trimmed,
      prompt: promptFor(label, "date"),
      mode: "date",
      addDays: Number(days[1]),
    };
  }
  if (hours && !days) {
    return {
      id,
      label,
      value: trimmed,
      prompt: promptFor(label, "time"),
      mode: "datetime",
      addHours: Number(hours[1]),
    };
  }
  return { id, label, value: trimmed, prompt: "", mode: "display" };
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

  const fields: [string, string, string | undefined][] = [
    ["delivery", "From delivery", rule.fromDelivery],
    ["use", "In use", rule.inUse],
    ["unopened", "Unopened", rule.unopened],
    ["prepped", "Prepped", rule.prepped],
    ["ambient", "Ambient use", rule.ambientUse],
    ["also", rule.also?.label ?? "Also", rule.also?.value],
  ];

  return fields
    .filter((field): field is [string, string, string] => Boolean(field[2]))
    .map(([id, label, value]) => clockFromValue(id, label, value));
}

export function projectClock(clock: Clock, raw: string, today: Date): ClockResult | null {
  const value = raw.trim();
  if (!value || clock.mode === "display") return null;

  if (clock.mode === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const iso = clock.addDays ? addDaysToIso(value, clock.addDays) : value;
    const readout = readExpiry(iso, today);
    const from = clock.addDays
      ? `From ${formatLongDate(value)}. ${readout.detail}.`
      : readout.detail;
    return {
      id: clock.id,
      when: formatLongDate(iso),
      detail: from,
      tone: readout.status,
      at: clock.cap ? endOfIsoDay(iso) : endOfIsoDay(iso),
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
