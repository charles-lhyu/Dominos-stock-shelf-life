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
  toIsoDate,
} from "@/lib/dates";
import { cn } from "cn";

/** Open lock with a raised, half-cut shackle — clearer than Lucide Unlock at tiny sizes. */
function OpenLockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="12" width="16" height="9" rx="2" />
      {/* Left post + high open arc (no right side — reads as cut open) */}
      <path d="M8 12V6.5" />
      <path d="M8 6.5C8 2.5 16 2 17.5 6" />
    </svg>
  );
}

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

/** 12-hour live clock; seconds only when there is room. */
function formatLiveClock12(date: Date, withSeconds: boolean) {
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  if (!withSeconds) return `${hour12}:${minute} ${suffix}`;
  const second = String(date.getSeconds()).padStart(2, "0");
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
  // Defer wall-clock to the client — `new Date()` in useState trips Next prerender.
  const [now, setNow] = useState<Date | null>(null);
  const locked = /^\d{2}:\d{2}$/.test(value);

  useEffect(() => {
    setNow(new Date());
    if (locked) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [locked]);

  const short = Boolean(compact || dense);
  const label = locked
    ? short
      ? formatShortTime(value)
      : formatDisplayTime(value)
    : now
      ? formatLiveClock(now, short)
      : short
        ? "--:--"
        : "--:--:-- --";

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (!locked) input.value = nowHhMm();
    openNativePicker(input);
  }

  return (
    <div
      className={cn("min-w-0", compact && "shrink-0", className)}
      data-no-collapse=""
    >
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
              "min-w-0 flex-1 truncate font-mono font-medium tracking-tight tabular-nums",
              locked ? "text-emerald-100" : "text-white",
              dense || compact ? "text-xs" : "text-[0.95rem]",
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

/** Date + prep time in one control (collapsed strip or expanded delivery row). */
export function CollapsedDateTime({
  date,
  onDateChange,
  time,
  onTimeChange,
  iconOnly,
  onIconActivate,
  className,
  fill,
  shortWeekday,
}: {
  date: string;
  onDateChange: (value: string) => void;
  time: string;
  onTimeChange: (value: string) => void;
  iconOnly?: boolean;
  onIconActivate?: () => void;
  className?: string;
  /** Stretch to the row width (expanded header). */
  fill?: boolean;
  /** e.g. Fri 24/10/26 in the expanded delivery row. */
  shortWeekday?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState<Date | null>(null);
  // Space tiers: 1 = 12h time, 2 = +seconds, 3 = +long date (priority order).
  const [spaceTier, setSpaceTier] = useState(fill ? 3 : 1);
  const use12h = spaceTier >= 1;
  const withSeconds = spaceTier >= 2;
  const longDate = spaceTier >= 3;
  const dateEmpty = !/^\d{4}-\d{2}-\d{2}$/.test(date);
  const locked = /^\d{2}:\d{2}$/.test(time);
  const dateLabel = dateEmpty
    ? "Choose a date"
    : longDate
      ? formatLongDate(date)
      : shortWeekday
        ? formatCompactWeekdayDate(date)
        : formatCompactDate(date);
  const timeLabel = locked
    ? use12h
      ? formatDisplayTime(time)
      : formatShortTime(time)
    : now
      ? use12h
        ? formatLiveClock12(now, withSeconds)
        : formatLiveClock(now, true)
      : use12h
        ? withSeconds
          ? "--:--:-- --"
          : "--:-- --"
        : "--:--";

  useEffect(() => {
    // Collapsed strip: always 12h (1st priority); no seconds/long date.
    if (!fill) {
      setSpaceTier(1);
      return;
    }
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setSpaceTier(3);
      return;
    }
    const apply = (width: number) => {
      // Unlock by priority as width grows: 12h → seconds → long date.
      if (width >= 360) setSpaceTier(3);
      else if (width >= 300) setSpaceTier(2);
      else if (width >= 240) setSpaceTier(1);
      else setSpaceTier(0);
    };
    apply(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      apply(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);
  const todayIso = now ? toIsoDate(now) : "";
  const dateTone: "today" | "past" | "future" | "empty" = dateEmpty
    ? "empty"
    : !todayIso
      ? "empty"
      : date === todayIso
        ? "today"
        : date < todayIso
          ? "past"
          : "future";
  const dateAccent =
    dateTone === "today"
      ? "emerald"
      : dateTone === "past"
        ? "orange"
        : dateTone === "future"
          ? "red"
          : null;
  const dateTextClass =
    dateAccent === "emerald"
      ? "text-emerald-300"
      : dateAccent === "orange"
        ? "text-orange-300"
        : dateAccent === "red"
          ? "text-red-300"
          : "text-stone-500";
  const timeTextClass = locked ? "text-red-200" : "text-emerald-200";
  // Outer border only — date fades L→R, time R→L. Inner fill must be opaque so colour can't show through.
  const dateFrame =
    dateAccent === "emerald"
      ? "#34d399"
      : dateAccent === "orange"
        ? "#fb923c"
        : dateAccent === "red"
          ? "#f87171"
          : "rgba(255,255,255,0.2)";
  const timeFrame = locked ? "#f87171" : "#34d399";
  const frameFadeStyle = {
    background: [
      `linear-gradient(to right, ${dateFrame}, transparent)`,
      `linear-gradient(to left, ${timeFrame}, transparent)`,
    ].join(","),
  };
  const todayBtnFade =
    dateAccent === "emerald"
      ? "bg-gradient-to-r from-emerald-400 to-emerald-400/35 text-emerald-950"
      : dateAccent === "orange"
        ? "bg-gradient-to-r from-orange-400 to-orange-400/35 text-orange-950"
        : dateAccent === "red"
          ? "bg-gradient-to-r from-red-400 to-red-400/35 text-red-950"
          : "bg-white text-stone-950 hover:bg-amber-50";
  const lockBtnFade = locked
    ? "bg-gradient-to-l from-red-500/55 to-red-500/20"
    : "bg-gradient-to-l from-emerald-400/55 to-emerald-400/20";

  useEffect(() => {
    setNow(new Date());
    if (locked) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [locked]);

  // Refresh date tone at midnight even when time is locked.
  useEffect(() => {
    if (!locked) return;
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [locked]);

  function openDate() {
    openNativePicker(dateRef.current);
  }

  function openTime() {
    const input = timeRef.current;
    if (!input) return;
    if (!locked) input.value = nowHhMm();
    openNativePicker(input);
  }

  if (iconOnly) {
    return (
      <div
        className={cn("relative size-10 shrink-0", className)}
        data-no-collapse=""
      >
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            onIconActivate?.();
            openDate();
          }}
          aria-label={dateLabel}
          title={dateLabel}
          className="flex size-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-200 ring-1 ring-white/12 transition-colors hover:bg-amber-400/25 active:bg-amber-400/30"
        >
          <CalendarDays className="size-4" strokeWidth={2.25} />
        </button>
        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-label="Delivery date"
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(fill ? "min-w-0 w-full" : "w-max shrink-0", className)}
      data-no-collapse=""
    >
      <div className="rounded-xl p-px transition-colors" style={frameFadeStyle}>
        <div
          className={cn(
            "flex h-10 items-stretch overflow-hidden rounded-[11px] bg-[#1c1917] bg-gradient-to-b from-white/[0.08] to-black/40",
            fill ? "w-full" : "w-max",
          )}
          aria-live={locked ? "off" : "polite"}
        >
        <button
          type="button"
          onClick={() => onDateChange(toIsoDate(new Date()))}
          className={cn(
            "inline-flex w-9 shrink-0 items-center justify-center border-r border-white/10 transition-colors",
            todayBtnFade,
          )}
          aria-label="Set to today"
          title="Today"
        >
          <CalendarCheck className="size-3.5" strokeWidth={2.25} aria-hidden />
        </button>

        <button
          type="button"
          onClick={openDate}
          className={cn(
            "flex items-center justify-center px-2 py-1 text-center transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]",
            fill ? "min-w-0 flex-1" : "shrink-0",
          )}
          aria-label={
            dateEmpty ? "Choose delivery date" : `Delivery date ${dateLabel}`
          }
          title={dateEmpty ? "Choose date" : dateLabel}
        >
          <span
            className={cn(
              "whitespace-nowrap text-xs font-medium leading-tight",
              fill && !longDate && "truncate",
              dateTextClass,
            )}
          >
            {dateLabel}
          </span>
        </button>

        <span className="my-2 w-px shrink-0 bg-white/20" aria-hidden />

        <button
          type="button"
          onClick={openTime}
          className={cn(
            "flex items-center justify-center px-2 py-1 text-center transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]",
            fill ? "min-w-0 flex-1" : "shrink-0",
          )}
          aria-label={
            locked
              ? `Locked prep time ${timeLabel}. Tap to change.`
              : `Live time ${timeLabel}. Tap to set and lock.`
          }
          title={locked ? `Locked · ${timeLabel}` : "Live · tap to set and lock"}
        >
          <span
            className={cn(
              "whitespace-nowrap font-mono text-xs font-medium tracking-tight tabular-nums",
              fill && spaceTier < 1 && "truncate",
              timeTextClass,
            )}
          >
            {timeLabel}
          </span>
        </button>

        <button
          type="button"
          onClick={() => (locked ? onTimeChange("") : onTimeChange(nowHhMm()))}
          className={cn(
            "inline-flex w-9 shrink-0 items-center justify-center border-l border-white/10 transition-colors",
            lockBtnFade,
          )}
          aria-label={
            locked ? "Unlock time and resume live clock" : "Lock current time"
          }
          title={locked ? "Unlock time" : "Lock time"}
        >
          <span
            className="relative inline-flex size-5 items-center justify-center"
            aria-hidden
          >
            <Clock3
              className={cn(
                "size-4",
                locked ? "text-amber-200" : "text-emerald-50",
              )}
              strokeWidth={2.25}
            />
            <span
              className={cn(
                "absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-sm shadow-sm ring-1",
                locked
                  ? "bg-white text-red-600 ring-red-200"
                  : "bg-stone-950 text-emerald-300 ring-emerald-200/80",
              )}
            >
              {locked ? (
                <Lock className="size-3" strokeWidth={2.5} absoluteStrokeWidth />
              ) : (
                <OpenLockIcon className="size-3" />
              )}
            </span>
          </span>
        </button>

        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-label="Delivery date"
        />
        <input
          ref={timeRef}
          type="time"
          value={locked ? time : ""}
          onChange={(event) => {
            const next = event.target.value;
            if (/^\d{2}:\d{2}$/.test(next)) onTimeChange(next);
          }}
          className="sr-only"
          tabIndex={-1}
          aria-label="Prep time"
        />
        </div>
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
    <div className={cn("min-w-0", className)} data-no-collapse="">
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
              "min-w-0 flex-1 truncate leading-tight",
              dense ? "text-sm" : "text-[0.95rem]",
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
    <div
      className={cn("relative min-w-0", iconOnly && "size-10 shrink-0", className)}
      data-no-collapse=""
    >
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
