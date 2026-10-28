"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import {
  getCompactDateFormat,
  subscribeDateFormat,
  toggleCompactDateFormat,
} from "@/lib/date-format-store";
import { readDebugDays, subscribeDebug } from "@/lib/debug-store";
import {
  daysBetween,
  formatCompactDate,
  formatCompactDateTime,
} from "@/lib/dates";
import { cn } from "cn";

function hasTimeInWhen(when: string) {
  return (
    /^\d{1,2}:\d{2}\s*\|/.test(when) ||
    /\|\s*\d{1,2}:\d{2}/.test(when) ||
    /\bat\s+\d{1,2}:\d{2}\b/i.test(when)
  );
}

function formatDaysFromToday(at: Date, today = new Date()) {
  const days = daysBetween(today, at);
  if (days === 0) return "0 days";
  if (days === 1) return "1 day";
  if (days === -1) return "-1 day";
  return `${days} days`;
}

function formatHoursFromNow(at: Date, today = new Date()) {
  const hours = Math.round((at.getTime() - today.getTime()) / 3_600_000);
  if (hours === 0) return "0 hours";
  if (hours === 1) return "1 hour";
  if (hours === -1) return "-1 hour";
  return `${hours} hours`;
}

/** Tap to toggle every date between the long form and DD/MM/YY (with time only if the long form has one). */
export function WhenDate({
  when,
  at,
  asHours = false,
  className,
}: {
  when: string;
  at?: Date | null;
  /** Debug mode: lives under a day show remaining hours instead of days. */
  asHours?: boolean;
  className?: string;
}) {
  const compact = useSyncExternalStore(
    subscribeDateFormat,
    getCompactDateFormat,
    getCompactDateFormat,
  );
  const showDays = useSyncExternalStore(
    subscribeDebug,
    readDebugDays,
    () => false,
  );

  if (!at) {
    return <span className={className}>{when}</span>;
  }

  if (showDays) {
    return (
      <span className={cn("overflow-hidden tabular-nums", className)}>
        {asHours ? formatHoursFromNow(at) : formatDaysFromToday(at)}
      </span>
    );
  }

  function toggle(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    toggleCompactDateFormat();
  }

  const compactLabel = hasTimeInWhen(when)
    ? formatCompactDateTime(at)
    : formatCompactDate(at);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={compact ? "Show full dates" : "Show short dates"}
      className={cn("touch-pan-y text-left overflow-hidden", className)}
    >
      {compact ? compactLabel : when}
    </button>
  );
}
