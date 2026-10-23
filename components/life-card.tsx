"use client";

import { useState } from "react";
import { sectionById } from "@/lib/chart";
import { parseIsoDate, toIsoDate } from "@/lib/dates";
import { capAdvice, clocksFor, projectClock, type ClockResult } from "@/lib/life";
import type { ShelfRule, StockStatus } from "@/lib/types";
import { cn } from "cn";

const SECTION_TONE: Record<ShelfRule["sectionId"], string> = {
  frozen: "bg-sky-100 text-sky-950",
  chilled: "bg-teal-100 text-teal-950",
  ready: "bg-amber-100 text-amber-950",
  ambient: "bg-orange-100 text-orange-950",
  pack: "bg-stone-200 text-stone-800",
};

function toneClass(tone: StockStatus) {
  if (tone === "expired") return "text-red-700";
  if (tone === "today" || tone === "critical") return "text-orange-700";
  if (tone === "soon" || tone === "watch") return "text-amber-800";
  return "text-emerald-800";
}

function nowLocal() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${toIsoDate(now)}T${hours}:${minutes}`;
}

export function LifeCard({ rule, todayIso }: { rule: ShelfRule; todayIso: string }) {
  const clocks = clocksFor(rule);
  const section = sectionById(rule.sectionId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const today = checkedAt ?? parseIsoDate(todayIso);
  const results = clocks
    .map((clock) => projectClock(clock, values[clock.id] ?? "", today))
    .filter((result): result is ClockResult => result != null);
  const advice = capAdvice(results);

  function setClock(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
    setCheckedAt(new Date());
  }

  return (
    <article className="ticket-in overflow-hidden rounded-2xl bg-white shadow-[6px_6px_0_0_rgba(28,25,23,0.12)] ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-5 sm:px-7">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", SECTION_TONE[rule.sectionId])}>
          {section.title}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {rule.category}
        </span>
      </div>
      <div className="px-5 pt-3 pb-6 sm:px-7">
        <h2 className="font-display text-4xl leading-tight text-stone-950">{rule.name}</h2>
        {rule.sameAs.length > 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            Same life on this chart row: {rule.sameAs.join(", ")}.
          </p>
        ) : null}
        {section.note ? <p className="mt-3 text-sm text-sky-950">{section.note}</p> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {clocks.map((clock) => {
            const result = results.find((item) => item.id === clock.id);
            return (
              <div key={clock.id} className="rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  {clock.label}
                </p>
                <p className="font-display text-4xl leading-none text-stone-950">{clock.value}</p>
                {clock.mode !== "display" ? (
                  <label className="mt-3 block text-sm text-stone-700">
                    {clock.prompt}
                    <span className="mt-1 flex gap-2">
                      <input
                        type={clock.mode === "datetime" ? "datetime-local" : "date"}
                        value={values[clock.id] ?? ""}
                        onChange={(event) => setClock(clock.id, event.target.value)}
                        className="h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3"
                      />
                      <button
                        type="button"
                        className="h-11 shrink-0 rounded-lg bg-stone-950 px-3 text-sm font-medium text-white"
                        onClick={() =>
                          setClock(clock.id, clock.mode === "datetime" ? nowLocal() : todayIso)
                        }
                      >
                        {clock.mode === "datetime" ? "Now" : "Today"}
                      </button>
                    </span>
                  </label>
                ) : null}
                {result ? (
                  <p className={cn("mt-3 font-display text-3xl leading-none", toneClass(result.tone))}>
                    {result.when}
                    <span className="mt-1 block font-sans text-sm font-medium">{result.detail}</span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {advice ? (
          <p className="mt-4 rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950">
            {advice}
          </p>
        ) : null}
        {rule.note ? (
          <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-800">{rule.note}</p>
        ) : null}
        {clocks.some((clock) => clock.addDays) ? (
          <p className="mt-4 text-xs text-stone-500">
            The use-by date is the date you enter plus the life on the chart. 1 Oct plus 12 days is 13 Oct.
          </p>
        ) : null}
      </div>
    </article>
  );
}
