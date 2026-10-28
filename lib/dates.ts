import type { StockStatus } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** True when today is after the chart’s valid-until day. */
export function isPastValidUntil(validUntil: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return false;
  return toIsoDate(today) > validUntil;
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysIso(today: Date, days: number): string {
  return toIsoDate(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + days),
  );
}

export function daysBetween(today: Date, expiry: Date): number {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const end = Date.UTC(
    expiry.getFullYear(),
    expiry.getMonth(),
    expiry.getDate(),
  );
  return Math.round((end - start) / 86_400_000);
}

/**
 * Days from today through the use-by date, counting today as day 1
 * (same inclusive count as chart day lives).
 */
export function inclusiveDaysRemaining(today: Date, expiry: Date): number {
  return daysBetween(today, expiry) + 1;
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function validIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return toIsoDate(date);
}

/** Excel 1900 date system. Serial 25569 is 1970-01-01. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < 20_000 || whole > 80_000) return null;
  const utc = new Date(Date.UTC(1970, 0, 1) + (whole - 25_569) * 86_400_000);
  return validIso(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function fromNamedMonth(
  day: number,
  monthName: string,
  year: number,
): string | null {
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return validIso(expandYear(year), month, day);
}

export function parseExpiry(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return validIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    if (value >= 19_000_000 && value <= 30_000_000) {
      const digits = String(Math.trunc(value));
      return validIso(
        Number(digits.slice(0, 4)),
        Number(digits.slice(4, 6)),
        Number(digits.slice(6, 8)),
      );
    }
    return excelSerialToIso(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const ymd = raw.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymd) {
    return validIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  const dayMonthName = raw.match(
    /^(\d{1,2})(?:st|nd|rd|th)?[/\-.\s]+([A-Za-z]+)[/\-.,\s]+(\d{2,4})$/,
  );
  if (dayMonthName) {
    const parsed = fromNamedMonth(
      Number(dayMonthName[1]),
      dayMonthName[2],
      Number(dayMonthName[3]),
    );
    if (parsed) return parsed;
  }

  const monthNameDay = raw.match(
    /^([A-Za-z]+)[/\-.\s]+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/,
  );
  if (monthNameDay) {
    const parsed = fromNamedMonth(
      Number(monthNameDay[2]),
      monthNameDay[1],
      Number(monthNameDay[3]),
    );
    if (parsed) return parsed;
  }

  const numeric = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]));
    let day = first;
    let month = second;
    if (first <= 12 && second > 12) {
      month = first;
      day = second;
    }
    return validIso(year, month, day);
  }

  return null;
}

export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAY[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** Day + month + year, no weekday — e.g. 7 Sep 2026 */
export function formatShortDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} | ${formatLongDate(toIsoDate(date))}`;
}

/** Compact date: DD/MM/YY */
export function formatCompactDate(date: Date | string): string {
  const value = typeof date === "string" ? parseIsoDate(date) : date;
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = String(value.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/** Short date with weekday: e.g. Fri 24/10/26 */
export function formatCompactWeekdayDate(date: Date | string): string {
  const value = typeof date === "string" ? parseIsoDate(date) : date;
  return `${WEEKDAY[value.getDay()]} ${formatCompactDate(value)}`;
}

/** Compact toggle format: HH:MM | DD/MM/YY */
export function formatCompactDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} | ${formatCompactDate(date)}`;
}

export function addDaysToIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

export function addHoursToLocal(value: string, hours: number): Date {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  const start = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
  // Store-clock hours. Adding elapsed milliseconds shifts the label by an hour
  // when the span crosses the end or start of British Summer Time.
  const end = new Date(start.getTime());
  end.setHours(end.getHours() + hours);
  return end;
}

export function endOfIsoDay(iso: string): Date {
  const date = parseIsoDate(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 0);
}

export function formatSheetDate(iso: string): string {
  const date = parseIsoDate(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatImportedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    timeZoneName: "short",
  }).format(date);
}

export type ExpiryReadout = {
  status: StockStatus;
  days: number | null;
  label: string;
  detail: string;
};

export function readExpiry(expiry: string | null, today: Date): ExpiryReadout {
  if (!expiry) {
    return {
      status: "missing",
      days: null,
      label: "No date",
      detail: "No use-by date on this line",
    };
  }

  const days = daysBetween(today, parseIsoDate(expiry));
  if (days < 0) {
    const ago = Math.abs(days);
    return {
      status: "expired",
      days,
      label: "Expired",
      detail: ago === 1 ? "1 day ago" : `${ago} days ago`,
    };
  }
  if (days === 0) {
    return {
      status: "today",
      days,
      label: "Use today",
      detail: "Expires today",
    };
  }
  if (days === 1) {
    return {
      status: "critical",
      days,
      label: "Tomorrow",
      detail: "1 day left",
    };
  }
  if (days <= 2) {
    return {
      status: "critical",
      days,
      label: `${days} days left`,
      detail: "Use soon",
    };
  }
  if (days <= 7) {
    return {
      status: "soon",
      days,
      label: `${days} days left`,
      detail: "Due this week",
    };
  }
  if (days <= 14) {
    return {
      status: "watch",
      days,
      label: `${days} days left`,
      detail: "Due this fortnight",
    };
  }
  return {
    status: "ok",
    days,
    label: `${days} days left`,
    detail: "In date",
  };
}
