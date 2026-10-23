"use client";

import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import {
  getCompactDateFormat,
  subscribeDateFormat,
} from "@/lib/date-format-store";
import { formatCompactDate, formatLongDate } from "@/lib/dates";
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

function PickerShell({
  label,
  icon,
  display,
  empty,
  actionLabel,
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
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  dense?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const Icon = icon === "date" ? CalendarDays : Clock3;
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
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              "shrink-0 border-l border-white/10 bg-white font-semibold text-stone-950 transition-all duration-200 hover:bg-amber-50 active:bg-stone-200",
              dense ? "px-2.5 text-xs" : "px-3.5 text-sm",
            )}
          >
            {actionLabel}
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
  onIconActivate,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onToday?: () => void;
  className?: string;
  dense?: boolean;
  iconOnly?: boolean;
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
    : compact
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
          actionLabel={onToday ? "Today" : undefined}
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
      actionLabel={onNow ? "Now" : undefined}
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
