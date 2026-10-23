"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { ChartList } from "@/components/chart-list";
import { LifeCard } from "@/components/life-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHART, FOOTNOTES, RULES, SECTIONS } from "@/lib/chart";
import { formatLongDate } from "@/lib/dates";
import { rulesForName, searchNames, shouldExpand } from "@/lib/search";
import { getServerToday, getTodayIso, subscribeToday } from "@/lib/today";
import type { SectionId } from "@/lib/types";
import { cn } from "cn";

const EXAMPLES = ["Pepperoni", "Dough", "Wings", "Mozzarella", "Fries"];

export function StockDesk() {
  const todayIso = useSyncExternalStore(subscribeToday, getTodayIso, getServerToday);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!todayIso) return;
    inputRef.current?.focus();
  }, [todayIso]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!todayIso) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-6 h-16 animate-pulse rounded-2xl bg-stone-200" />
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-stone-200" />
      </main>
    );
  }

  const chartLapsed = todayIso > CHART.validUntil;
  const hits = searchNames(query);
  const pickedName = picked && hits.some((hit) => hit.name === picked) ? picked : null;
  const expanded = pickedName ?? (shouldExpand(hits) ? hits[0]?.name ?? null : null);
  const rules = expanded ? rulesForName(expanded) : [];
  const others = expanded ? hits.filter((hit) => hit.name !== expanded) : hits;

  function choose(name: string) {
    setQuery(name);
    setPicked(name);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.select());
  }

  return (
    <>
      <header className="border-b border-red-700/40 bg-[#172033] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-300">
            {CHART.audience} · {CHART.version}
          </p>
          <h1 className="font-display text-4xl leading-none">Shelf life</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-white/70">
            Campaign 5 chart, issued {formatLongDate(CHART.issued)}. Type a product and the life
            from the chart is shown. Enter the delivery, prep, or pack date to get the use-by date.
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <p
          className={cn(
            "rounded-xl px-4 py-3 text-sm",
            chartLapsed
              ? "bg-red-700 text-white"
              : "bg-white text-stone-800 ring-1 ring-stone-200",
          )}
        >
          {chartLapsed
            ? `This chart was valid until ${formatLongDate(CHART.validUntil)}. Check that Campaign 5 is still the current chart.`
            : `Valid until ${formatLongDate(CHART.validUntil)}. Today on this screen is ${formatLongDate(todayIso)}.`}
        </p>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (hits[0]) choose(hits[0].name);
            requestAnimationFrame(() => inputRef.current?.select());
          }}
        >
          <label htmlFor="product-search" className="mb-2 flex items-center gap-2 text-sm font-medium text-stone-700">
            <Search className="size-4" />
            Type the product
          </label>
          <div className="flex gap-2">
            <Input
              id="product-search"
              ref={inputRef}
              value={query}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Pepperoni, dough, wings, mozzarella"
              className="h-14 rounded-2xl bg-white px-4 text-lg shadow-[4px_4px_0_0_rgba(28,25,23,0.08)] md:text-lg"
              onChange={(event) => {
                setQuery(event.target.value);
                setPicked(null);
              }}
            />
            {query ? (
              <Button
                type="button"
                variant="outline"
                className="h-14 rounded-2xl bg-white px-3"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setPicked(null);
                  inputRef.current?.focus();
                }}
              >
                <X />
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Press Enter to open the first match. Press / to jump back here.
          </p>
        </form>

        {!query.trim() ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => choose(example)}
                className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}

        {query.trim() && hits.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white/80 px-5 py-8 text-center">
            <span className="font-display text-2xl text-stone-950">Not on this chart</span>
            <span className="mt-2 block text-sm text-stone-600">
              Nothing matches “{query.trim()}”. Try the name printed on the Campaign 5 sheet.
            </span>
          </p>
        ) : null}

        {rules.length > 0 ? (
          <div className="mt-5 space-y-4" aria-live="polite">
            {rules.map((rule) => (
              <LifeCard key={rule.id} rule={rule} todayIso={todayIso} />
            ))}
          </div>
        ) : null}

        {others.length > 0 ? (
          <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
            <p className="px-2 py-1 text-sm text-stone-600">
              {expanded ? "Also matches" : `${others.length} products match. Choose one.`}
            </p>
            <ul className="divide-y divide-stone-100">
              {others.slice(0, 12).map((hit) => {
                const preview = rulesForName(hit.name)[0];
                return (
                  <li key={hit.name}>
                    <button
                      type="button"
                      onClick={() => choose(hit.name)}
                      className="flex w-full items-baseline justify-between gap-3 rounded-xl px-2 py-3 text-left hover:bg-stone-50"
                    >
                      <span className="font-medium text-stone-950">{hit.name}</span>
                      <span className="text-sm text-stone-500">
                        {preview?.prepped || preview?.fromDelivery || preview?.unopened}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!query.trim() ? (
          <>
            <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Chart sections">
              <FilterChip selected={section === "all"} onClick={() => setSection("all")}>
                Whole chart
              </FilterChip>
              {SECTIONS.map((item) => (
                <FilterChip
                  key={item.id}
                  selected={section === item.id}
                  onClick={() => setSection(item.id)}
                >
                  {item.short}
                </FilterChip>
              ))}
            </div>
            <ChartList rules={RULES} section={section} onOpen={choose} />
          </>
        ) : null}

        <ul className="mt-8 space-y-2 text-sm text-stone-600">
          {FOOTNOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </main>
    </>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium ring-1",
        selected ? "bg-stone-950 text-white ring-stone-950" : "bg-white text-stone-700 ring-stone-200",
      )}
    >
      {children}
    </button>
  );
}
