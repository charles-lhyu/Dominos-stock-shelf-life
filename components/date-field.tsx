"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CalendarCheck, CalendarDays, Clock3, Lock, Unlock } from "lucide-react";
import {
  getCompactDateFormat,
  subscribeDateFormat,
} from "@/lib/date-format-store";
import {
  formatCompactDate,
  formatCompactWeekdayDate,
  formatLongDate,
} from "@/lib/dates";
import { cn } from "cn";

function formatDisplayTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return value || "Set time";
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

function formatLiveClock(date: Date, short = false) {
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  if (short) return `${String(hour).padStart(2, "0")}:${minute}`;
  const second = String(date.getSeconds()).padStart(2, "0");
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute}:${second} ${suffix}`;
}

function formatShortTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return value || "--:--";
  return `${match[1]}:${match[2]}`;
}

function nowHhMm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function openNativePicker(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    // Fall through to click().
  }
  input.click();
}

/**
 * Live wall-clock until a time is chosen — then it locks.
 * Unlock clears the set time and resumes live updates.
 */
export function PrepTimeClock({
  value,
  onChange,
  className,
  dense,
  compact,
}: {
  /** Locked `HH:MM`, or `""` for live. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  dense?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => new Date());
  const locked = /^\d{2}:\d{2}$/.test(value);

  useEffect(() => {
    if (locked) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [locked]);

  const short = Boolean(compact || dense);
  const label = locked
    ? short
      ? formatShortTime(value)
      : formatDisplayTime(value)
    : formatLiveClock(now, short);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (!locked) input.value = nowHhMm();
    openNativePicker(input);
  }

  return (
    <div className={cn("min-w-0", compact && "shrink-0", className)}>
      <div
        className={cn(
          "flex min-w-0 items-stretch overflow-hidden bg-gradient-to-b from-white/[0.08] to-black/40 ring-1 transition-colors",
          locked ? "ring-emerald-400/35" : "ring-white/12",
          dense || compact ? "min-h-10 rounded-xl" : "min-h-12 rounded-2xl",
          compact && "h-10",
        )}
        aria-live={locked ? "off" : "polite"}
      >
        <button
          type="button"
          onClick={openPicker}
          className={cn(
            "flex min-w-0 flex-1 items-center text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]",
            dense || compact ? "gap-1.5 px-1.5 py-1" : "gap-2.5 px-2.5 py-1.5",
          )}
          aria-label={
            locked
              ? `Locked prep time ${label}. Tap to change.`
              : `Live time ${label}. Tap to set and lock.`
          }
          title={locked ? `Locked · ${label}` : "Live · tap to set and lock"}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              locked ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-400/15 text-amber-200",
              dense || compact ? "size-6 rounded-md" : "size-9 rounded-xl",
            )}
          >
            {locked ? (
              <Lock
                className={cn(dense || compact ? "size-3" : "size-4")}
                strokeWidth={2.25}
              />
            ) : (
              <Clock3
                className={cn(dense || compact ? "size-3" : "size-4")}
                strokeWidth={2.25}
              />
            )}
          </span>
          <span
            className={cn(
              "font-mono font-medium tracking-tight tabular-nums",
              locked ? "text-emerald-100" : "text-white",
              dense || compact ? "whitespace-nowrap text-xs" : "text-[0.95rem]",
            )}
          >
            {label}
          </span>
        </button>
        <button
          type="button"
          onClick={() => (locked ? onChange("") : onChange(nowHhMm()))}
          className={cn(
            "inline-flex shrink-0 items-center justify-center border-l border-white/10 transition-colors",
            locked
              ? "bg-emerald-400/20 text-emerald-50 hover:bg-emerald-400/30"
              : "bg-white text-stone-950 hover:bg-amber-50 active:bg-stone-200",
            dense || compact ? "w-9" : "w-11",
          )}
          aria-label={
            locked ? "Unlock time and resume live clock" : "Lock current time"
          }
          title={locked ? "Unlock" : "Lock"}
        >
          {locked ? (
            <Unlock className={cn(dense || compact ? "size-3.5" : "size-4")} aria-hidden />
          ) : (
            <Lock className={cn(dense || compact ? "size-3.5" : "size-4")} aria-hidden />
          )}
        </button>
        <input
          ref={inputRef}
          type="time"
          value={locked ? value : ""}
          onChange={(event) => {
            const next = event.target.value;
            if (/^\d{2}:\d{2}$/.test(next)) onChange(next);
          }}
          className="sr-only"
          tabIndex={-1}
          aria-label="Prep time"
        />
      </div>
    </div>
  );
}

function PickerShell({
  label,
  icon,
  display,
  empty,
  action,
  onAction,
  className,
  dense,
  onOpen,
  children,
}: {
  label?: string;
  icon: "date" | "time";
  display: string;
  empty: boolean;
  action?: "today" | "now";
  onAction?: () => void;
  className?: string;
  dense?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const Icon = icon === "date" ? CalendarDays : Clock3;
  const ActionIcon = action === "now" ? Clock3 : CalendarCheck;
  const actionAria = action === "now" ? "Set to now" : "Set to today";
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <p
          className={cn(
            "font-medium tracking-wide text-stone-400 transition-all duration-200",
            dense ? "mb-1 text-[10px]" : "mb-1.5 text-xs",
          )}
        >
          {label}
        </p>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 items-stretch overflow-hidden bg-gradient-to-b from-white/[0.08] to-black/40 ring-1 ring-white/12 transition-all duration-200 focus-within:ring-white/25",
          dense ? "min-h-10 rounded-xl" : "min-h-12 rounded-2xl",
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex min-w-0 flex-1 items-center text-left transition-all duration-200 hover:bg-white/[0.03] active:bg-white/[0.05]",
            dense ? "gap-2 px-2 py-1" : "gap-2.5 px-2.5 py-1.5",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center bg-amber-400/15 text-amber-200 transition-all duration-200",
              dense ? "size-7 rounded-lg" : "size-9 rounded-xl",
            )}
          >
            <Icon className={cn(dense ? "size-3.5" : "size-4")} strokeWidth={2.25} />
          </span>
          <span
            className={cn(
              "leading-tight",
              dense
                ? "shrink-0 whitespace-nowrap text-sm"
                : "min-w-0 flex-1 truncate text-[0.95rem]",
              empty ? "text-stone-500" : "font-medium text-white",
            )}
          >
            {display}
          </span>
        </button>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            aria-label={actionAria}
            title={actionAria}
            className={cn(
              "inline-flex shrink-0 items-center justify-center border-l border-white/10 bg-white text-stone-950 transition-all duration-200 hover:bg-amber-50 active:bg-stone-200",
              dense ? "w-9" : "w-11",
            )}
          >
            <ActionIcon className={cn(dense ? "size-3.5" : "size-4")} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  onToday,
  className,
  dense,
  iconOnly,
  shortDate,
  shortWeekday,
  onIconActivate,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onToday?: () => void;
  className?: string;
  dense?: boolean;
  iconOnly?: boolean;
  /** Force DD/MM/YY (e.g. collapsed header). */
  shortDate?: boolean;
  /** Short date with weekday, e.g. Fri 24/10/26 (expanded delivery field). */
  shortWeekday?: boolean;
  /** Called before opening when the icon-only control is used (e.g. restore search width). */
  onIconActivate?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = !/^\d{4}-\d{2}-\d{2}$/.test(value);
  const compact = useSyncExternalStore(
    subscribeDateFormat,
    getCompactDateFormat,
    getCompactDateFormat,
  );
  const display = empty
    ? "Choose a date"
    : shortWeekday
      ? formatCompactWeekdayDate(value)
      : shortDate || compact
        ? formatCompactDate(value)
        : formatLongDate(value);

  function open() {
    openNativePicker(inputRef.current);
  }

  // Keep one stable <input> across icon/full so showPicker survives the layout swap.
  return (
    <div className={cn("relative min-w-0", iconOnly && "size-10 shrink-0", className)}>
      {iconOnly ? (
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            onIconActivate?.();
            open();
          }}
          aria-label={display}
          title={display}
          className="flex size-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-200 ring-1 ring-white/12 transition-colors hover:bg-amber-400/25 active:bg-amber-400/30"
        >
          <CalendarDays className="size-4" strokeWidth={2.25} />
        </button>
      ) : (
        <PickerShell
          label={label}
          icon="date"
          display={display}
          empty={empty}
          action={onToday ? "today" : undefined}
          onAction={onToday}
          dense={dense}
          onOpen={open}
        >
          {null}
        </PickerShell>
      )}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-label={label ?? "Date"}
      />
    </div>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  onNow,
  className,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onNow?: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = !/^\d{2}:\d{2}$/.test(value);

  return (
    <PickerShell
      label={label}
      icon="time"
      display={formatDisplayTime(value)}
      empty={empty}
      action={onNow ? "now" : undefined}
      onAction={onNow}
      className={className}
      onOpen={() => openNativePicker(inputRef.current)}
    >
      <input
        ref={inputRef}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-label={label ?? "Time"}
      />
    </PickerShell>
  );
}
