"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChangelogEntry } from "@/lib/changelog";
import { formatAppVersion } from "@/lib/changelog";
import { cn } from "cn";

export function ChangelogNotes({
  entries,
  className,
  compact = false,
}: {
  entries: ChangelogEntry[];
  className?: string;
  compact?: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {entries.map((entry) => (
        <ChangelogEntryNotes key={entry.version} entry={entry} compact={compact} />
      ))}
    </div>
  );
}

/** One release at a time — version dropdown plus older/newer arrows. */
export function ChangelogBrowser({
  entries,
  className,
}: {
  entries: ChangelogEntry[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const versionKey = entries.map((item) => item.version).join("|");

  // Only clamp when the version list itself changes — never snap back to latest
  // just because the parent re-rendered with a new array reference.
  useEffect(() => {
    setIndex((prev) => {
      if (entries.length === 0) return 0;
      return Math.min(prev, entries.length - 1);
    });
  }, [versionKey, entries.length]);

  if (entries.length === 0) return null;

  const safeIndex = Math.min(index, entries.length - 1);
  const entry = entries[safeIndex]!;
  const newerDisabled = safeIndex <= 0;
  const olderDisabled = safeIndex >= entries.length - 1;

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Newer version"
          disabled={newerDisabled}
          onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-card text-white transition-colors",
            newerDisabled
              ? "opacity-35"
              : "hover:bg-white/10 active:bg-white/15",
          )}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <Select
            value={entry.version}
            items={entries.map((item) => ({
              value: item.version,
              label: formatAppVersion(item.version),
            }))}
            onValueChange={(value) => {
              if (typeof value !== "string") return;
              const next = entries.findIndex((item) => item.version === value);
              if (next >= 0) setIndex(next);
            }}
          >
            <SelectTrigger
              aria-label="Changelog version"
              className="h-10 w-full justify-center rounded-xl border-white/10 bg-card px-3 font-mono text-sm text-white hover:bg-white/[0.06] focus-visible:border-sky-400/40 focus-visible:ring-sky-400/30 dark:bg-card dark:hover:bg-white/[0.06] [&_[data-slot=select-value]]:justify-center"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center" className="min-w-[8rem]">
              {entries.map((item) => (
                <SelectItem
                  key={item.version}
                  value={item.version}
                  className="font-mono"
                >
                  {formatAppVersion(item.version)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          aria-label="Older version"
          disabled={olderDisabled}
          onClick={() =>
            setIndex((prev) => Math.min(entries.length - 1, prev + 1))
          }
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-card text-white transition-colors",
            olderDisabled
              ? "opacity-35"
              : "hover:bg-white/10 active:bg-white/15",
          )}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
        <ChangelogEntryNotes entry={entry} />
      </div>
    </div>
  );
}

function ChangelogEntryNotes({
  entry,
  compact = false,
}: {
  entry: ChangelogEntry;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {entry.notes.length > 0 ? (
        <ul
          className={cn(
            "list-disc space-y-1.5 pl-4 text-stone-300",
            compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
          )}
        >
          {entry.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : (
        <p className={cn("text-stone-500", compact ? "text-xs" : "text-sm")}>
          No notes for this release.
        </p>
      )}
    </div>
  );
}
