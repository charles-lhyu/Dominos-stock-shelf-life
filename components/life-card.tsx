"use client";

import { useEffect, useState } from "react";
import { DateField, TimeField } from "@/components/date-field";
import { WhenDate } from "@/components/when-date";
import { sectionFromPack } from "@/lib/chart-pack";
import { toIsoDate } from "@/lib/dates";
import { capAdvice, clocksFor, projectClock, type Clock, type ClockResult } from "@/lib/life";
import { isPrintedPackDate, LIFE_KIND_META, prepClockTime, type LifeKind } from "@/lib/preview";
import type { ChartPack, ShelfRule, StockStatus } from "@/lib/types";
import { cn } from "cn";

const SECTION_TONE: Record<ShelfRule["sectionId"], string> = {
  frozen: "bg-sky-500/20 text-sky-200",
  chilled: "bg-teal-500/20 text-teal-200",
  ready: "bg-amber-500/20 text-amber-200",
  ambient: "bg-orange-500/20 text-orange-200",
  pack: "bg-stone-500/25 text-stone-200",
};

function toneClass(tone: StockStatus) {
  if (tone === "expired") return "text-red-400";
  if (tone === "today" || tone === "critical") return "text-orange-300";
  if (tone === "soon" || tone === "watch") return "text-amber-300";
  return "text-emerald-300";
}

function nowLocal() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${toIsoDate(now)}T${hours}:${minutes}`;
}

function initialValues(
  rule: ShelfRule,
  deliveryDate: string,
  prepTime: string,
  today: Date,
): Record<string, string> {
  if (!deliveryDate) return {};
  const values: Record<string, string> = {};
  for (const clock of clocksFor(rule)) {
    if (isPrintedPackDate(clock)) continue;
    if (clock.mode === "date") values[clock.id] = deliveryDate;
    if (clock.mode === "datetime") values[clock.id] = `${deliveryDate}T${prepClockTime(prepTime, today)}`;
  }
  return values;
}

function kindForClockId(id: string): LifeKind | null {
  for (const [kind, meta] of Object.entries(LIFE_KIND_META) as [LifeKind, (typeof LIFE_KIND_META)[LifeKind]][]) {
    if (meta.clockIds.includes(id)) return kind;
  }
  return null;
}

/** Prepped/in-use and ambient use are shown as a left/right pair. */
function clockRows(clocks: Clock[]): Clock[][] {
  const prepped = clocks.find((clock) => clock.id === "prepped" || clock.id === "use");
  const ambient = clocks.find((clock) => clock.id === "ambient");
  const paired = new Set<string>();
  const rows: Clock[][] = [];

  if (prepped && ambient) {
    rows.push([prepped, ambient]);
    paired.add(prepped.id);
    paired.add(ambient.id);
  }

  for (const clock of clocks) {
    if (paired.has(clock.id)) continue;
    rows.push([clock]);
  }
  return rows;
}

export function LifeCard({
  rule,
  pack,
  deliveryDate = "",
  prepTime = "",
  focusKind = null,
}: {
  rule: ShelfRule;
  pack: ChartPack;
  deliveryDate?: string;
  prepTime?: string;
  focusKind?: LifeKind | null;
}) {
  const clocks = clocksFor(rule);
  const focusIds = new Set(
    focusKind === "prepped"
      ? clocks.filter((clock) => {
          const kind = kindForClockId(clock.id);
          return kind === "prepped" || kind === "ambient";
        }).map((clock) => clock.id)
      : focusKind
        ? clocks.filter((clock) => kindForClockId(clock.id) === focusKind).map((clock) => clock.id)
        : [],
  );
  const ordered =
    focusIds.size > 0
      ? [
          ...clocks.filter((clock) => focusIds.has(clock.id)),
          ...clocks.filter((clock) => !focusIds.has(clock.id)),
        ]
      : clocks;
  const rows = clockRows(ordered);
  const section = sectionFromPack(pack, rule.sectionId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const seeded = initialValues(rule, deliveryDate, prepTime, new Date());
    setValues(seeded);
    setCheckedAt(Object.keys(seeded).length > 0 ? new Date() : null);
  }, [rule.id, deliveryDate, prepTime]);

  const results = checkedAt
    ? clocks
        .map((clock) => projectClock(clock, values[clock.id] ?? "", checkedAt))
        .filter((result): result is ClockResult => result != null)
    : [];
  const advice = capAdvice(results);

  function setClock(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
    setCheckedAt(new Date());
  }

  function renderClock(clock: Clock) {
    const result = results.find((item) => item.id === clock.id);
    const focused = focusIds.size > 0 ? focusIds.has(clock.id) : false;
    const datetime = clock.mode === "datetime";
    const raw = values[clock.id] ?? "";
    const datePart = datetime ? raw.slice(0, 10) : raw;
    const timePart = datetime && raw.includes("T") ? raw.slice(11, 16) : "00:00";

    return (
      <div
        key={clock.id}
        className={cn(
          "min-w-0 max-w-full overflow-hidden rounded-xl bg-black/25 px-3 py-3 ring-1 sm:px-4",
          focused ? "ring-violet-300/60" : "ring-white/10",
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          {clock.id === "ambient"
            ? "Ambient use"
            : clock.id === "prepped" || clock.id === "use"
              ? clock.chilled
                ? "Prepped (Chilled)"
                : "Prepped"
              : clock.label}
        </p>
        <p className="font-display text-3xl leading-none break-words text-white">{clock.value}</p>
        {clock.mode !== "display" && !isPrintedPackDate(clock) ? (
          <div className="mt-3 min-w-0 space-y-2">
            {datetime ? (
              <>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <DateField
                    label={
                      clock.id === "ambient"
                        ? "Ambient date"
                        : clock.id === "prepped" || clock.id === "use"
                          ? "Prepped on"
                          : clock.prompt
                    }
                    value={datePart}
                    onChange={(next) => setClock(clock.id, `${next}T${timePart || "00:00"}`)}
                  />
                  <TimeField
                    label="Time"
                    value={timePart}
                    onChange={(next) =>
                      setClock(clock.id, `${datePart || toIsoDate(new Date())}T${next}`)
                    }
                  />
                </div>
                <button
                  type="button"
                  className="h-11 w-full rounded-2xl bg-white text-sm font-semibold text-stone-950 transition-transform active:scale-[0.99]"
                  onClick={() => setClock(clock.id, nowLocal())}
                >
                  Use now
                </button>
              </>
            ) : (
              <DateField
                label={
                  clock.id === "ambient"
                    ? "Ambient from"
                    : clock.id === "prepped" || clock.id === "use"
                      ? "Prepped on"
                      : clock.prompt
                }
                value={raw}
                onChange={(next) => setClock(clock.id, next)}
                onToday={() => setClock(clock.id, toIsoDate(new Date()))}
              />
            )}
          </div>
        ) : null}
        {result ? (
          <div className={cn("mt-3 min-w-0", toneClass(result.tone))}>
            <WhenDate
              when={result.when}
              at={result.at}
              className="font-display text-2xl leading-none break-words"
            />
            <span className="mt-1 block font-sans text-sm font-medium text-stone-300">
              {result.detail}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <article className="ticket-in max-w-full min-w-0 overflow-hidden rounded-2xl bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.35)] ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", SECTION_TONE[rule.sectionId])}>
          {section.short}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          {rule.category}
        </span>
        {focusKind ? (
          <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-semibold tracking-wide text-violet-100">
            {LIFE_KIND_META[focusKind].tag}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-4 pt-3 pb-5">
        <h2 className="font-display text-3xl leading-tight text-white">{rule.name}</h2>
        {rule.sameAs.length > 0 ? (
          <p className="mt-2 text-sm text-stone-400">
            Same life: {rule.sameAs.join(", ")}.
          </p>
        ) : null}
        {section.note ? <p className="mt-3 text-sm text-sky-200">{section.note}</p> : null}
        <div className="mt-4 grid min-w-0 gap-3">
          {rows.map((row) => {
            if (row.length === 2) {
              return (
                <div
                  key={row.map((clock) => clock.id).join("-")}
                  className="grid min-w-0 grid-cols-1 gap-3"
                >
                  {row.map((clock) => renderClock(clock))}
                </div>
              );
            }
            return renderClock(row[0]!);
          })}
        </div>
        {advice ? (
          <p className="mt-4 rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100">
            {advice}
          </p>
        ) : null}
        {rule.note ? (
          <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-sm text-stone-200">{rule.note}</p>
        ) : null}
        {clocks.some((clock) => clock.addDays) ? (
          <p className="mt-4 text-xs text-stone-500">
            The life is added to the date you enter. 12 days from 1 Oct is 13 Oct.
          </p>
        ) : null}
      </div>
    </article>
  );
}
