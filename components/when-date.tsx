"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import {
  getCompactDateFormat,
  subscribeDateFormat,
  toggleCompactDateFormat,
} from "@/lib/date-format-store";
import { formatCompactDate, formatCompactDateTime } from "@/lib/dates";
import { cn } from "cn";

function hasTimeInWhen(when: string) {
  return /\|\s*\d{1,2}:\d{2}/.test(when) || /\bat\s+\d{1,2}:\d{2}\b/i.test(when);
}

/** Tap to toggle every date between the long form and DD/MM/YY (with time only if the long form has one). */
export function WhenDate({
  when,
  at,
  className,
}: {
  when: string;
  at?: Date | null;
  className?: string;
}) {
  const compact = useSyncExternalStore(
    subscribeDateFormat,
    getCompactDateFormat,
    getCompactDateFormat,
  );

  if (!at) {
    return <span className={className}>{when}</span>;
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
      className={cn("touch-pan-y text-left", className)}
    >
      {compact ? compactLabel : when}
    </button>
  );
}
