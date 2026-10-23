"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { ChartList } from "@/components/chart-list";
import { DateField } from "@/components/date-field";
import { DragScroll } from "@/components/drag-scroll";
import { ImportChartButton } from "@/components/import-chart";
import { LifeCard } from "@/components/life-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCompactDateFormat,
  subscribeDateFormat,
  toggleCompactDateFormat,
} from "@/lib/date-format-store";
import { formatCompactDate, formatShortDate, toIsoDate } from "@/lib/dates";
import {
  getDeskState,
  hydrateDeskStore,
  setDeliveryDate,
  subscribeDesk,
} from "@/lib/desk-store";
import {
  categoriesInPack,
  LIFE_KIND_META,
  LIFE_KINDS,
  lifeKindsForRule,
  pickLifeKind,
  pickVariant,
  FILTER_SECTIONS,
  SECTION_TAG,
  sectionMatchesFilter,
  sectionNameCounts,
  uniqueNamesInCategory,
  variantsForName,
  type LifeKind,
} from "@/lib/preview";
import { rulesForName, searchNames, shouldExpand } from "@/lib/search";
import type { SectionId, ShelfRule } from "@/lib/types";
import { cn } from "cn";

const LAST_SECTION_KEY = "shelf-life-last-section";
const LAST_LIFE_KEY = "shelf-life-last-life";

function shortHintName(name: string) {
  return name
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s+-\s+.+$/, "")
    .replace(/^NEW\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesByCategory(rules: ShelfRule[]) {
  const map = new Map<string, string[]>();
  for (const rule of rules) {
    const hint = shortHintName(rule.name);
    if (!hint) continue;
    const list = map.get(rule.category) ?? [];
    if (!list.some((item) => item.toLowerCase() === hint.toLowerCase())) {
      list.push(hint);
    }
    map.set(rule.category, list);
  }
  return [...map.values()].filter((names) => names.length >= 2);
}

function randomCategoryPlaceholder(rules: ShelfRule[], avoid?: string) {
  const groups = namesByCategory(rules);
  if (groups.length === 0) return "Search the chart…";

  const pickGroup = () => groups[Math.floor(Math.random() * groups.length)] ?? groups[0];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const group = pickGroup();
    const pool = [...group];
    const count = Math.min(3, pool.length);
    const picked: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(index, 1)[0]!);
    }
    const next = `${picked.join(", ")}…`;
    if (next !== avoid) return next;
  }
  return `${groups[0]!.slice(0, 3).join(", ")}…`;
}

function readLastSection(): SectionId | null {
  try {
    const value = window.localStorage.getItem(LAST_SECTION_KEY);
    if (
      value === "frozen" ||
      value === "chilled" ||
      value === "ready" ||
      value === "ambient" ||
      value === "pack"
    ) {
      return value;
    }
  } catch {
    // Ignore.
  }
  return null;
}

function readLastLife(): LifeKind | null {
  try {
    const value = window.localStorage.getItem(LAST_LIFE_KEY);
    if (value === "stock" || value === "prepped" || value === "ambient") return value;
  } catch {
    // Ignore.
  }
  return null;
}

export function StockDesk() {
  const desk = useSyncExternalStore(subscribeDesk, getDeskState, getDeskState);
  const compactDates = useSyncExternalStore(
    subscribeDateFormat,
    getCompactDateFormat,
    getCompactDateFormat,
  );
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [category, setCategory] = useState<string | "all">("all");
  const [sectionFilter, setSectionFilter] = useState<SectionId | "all">("all");
  const [lifeFilter, setLifeFilter] = useState<LifeKind | "all">("all");
  const [preferredSection, setPreferredSection] = useState<SectionId | null>(null);
  const [preferredLife, setPreferredLife] = useState<LifeKind | null>(null);
  const [placeholder, setPlaceholder] = useState("Pepperoni, Chorizo, Nduja Sausage…");
  const [today, setToday] = useState<Date | null>(null);
  /** 0 = title fully shown, 1 = title hidden (list may scroll). */
  const [headerCollapse, setHeaderCollapse] = useState(0);
  const headerCollapseRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { pack, deliveryDate, imported } = desk;
  const { chart, footnotes, rules } = pack;
  const categories = categoriesInPack(pack);
  const categoryCounts = Object.fromEntries(
    categories.map((item) => [item, uniqueNamesInCategory(rules, item).length]),
  ) as Record<string, number>;
  const categoryTotal = uniqueNamesInCategory(rules, "all").length;
  const storageCounts = sectionNameCounts(rules, category);

  useEffect(() => {
    hydrateDeskStore();
    setPreferredSection(readLastSection());
    setPreferredLife(readLastLife());
    setToday(new Date());
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!shellRef.current || !mainRef.current) return;
    const shell: HTMLDivElement = shellRef.current;
    const scroller: HTMLElement = mainRef.current;

    const COLLAPSE_PX = 108;
    let frame = 0;

    function publishCollapse(next: number) {
      const clamped = Math.min(1, Math.max(0, next));
      headerCollapseRef.current = clamped;
      // Keep the list locked until the title has finished hiding.
      scroller.style.overflowY = clamped >= 1 ? "auto" : "hidden";
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHeaderCollapse(clamped));
    }

    scroller.style.overflowY = headerCollapseRef.current >= 1 ? "auto" : "hidden";

    function applyScrollDelta(deltaY: number) {
      let remaining = deltaY;
      const collapse = headerCollapseRef.current;

      if (remaining > 0 && collapse < 1) {
        const room = (1 - collapse) * COLLAPSE_PX;
        const take = Math.min(room, remaining);
        publishCollapse(collapse + take / COLLAPSE_PX);
        remaining -= take;
      } else if (remaining < 0 && scroller.scrollTop <= 0 && collapse > 0) {
        const room = collapse * COLLAPSE_PX;
        const take = Math.min(room, -remaining);
        publishCollapse(collapse - take / COLLAPSE_PX);
        remaining += take;
      }

      if (remaining !== 0 && headerCollapseRef.current >= 1) {
        scroller.scrollTop += remaining;
      }
    }

    const onWheel = (event: WheelEvent) => {
      const collapse = headerCollapseRef.current;
      const overHeader = !(event.target as HTMLElement | null)?.closest("main");
      if (
        overHeader ||
        (event.deltaY > 0 && collapse < 1) ||
        (event.deltaY < 0 && scroller.scrollTop <= 0 && collapse > 0)
      ) {
        event.preventDefault();
        applyScrollDelta(event.deltaY);
      }
    };

    const drag = {
      active: false,
      moved: false,
      /** Started on a horizontal chip strip — wait to see axis. */
      fromChipStrip: false,
      ignored: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      startScroll: 0,
      startCollapse: 0,
    };
    let suppressClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      // Allow dragging from date/tags (buttons); only skip real text fields.
      if (target?.closest("input, textarea, [data-no-drag-scroll]")) return;

      const inMain = Boolean(target?.closest("main"));
      // Touch on the open list: leave native scrolling alone.
      if (
        inMain &&
        event.pointerType !== "mouse" &&
        headerCollapseRef.current >= 1 &&
        scroller.scrollTop > 0
      ) {
        return;
      }

      drag.active = true;
      drag.moved = false;
      drag.ignored = false;
      drag.fromChipStrip = Boolean(target?.closest("[data-drag-scroll]"));
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.startScroll = scroller.scrollTop;
      drag.startCollapse = headerCollapseRef.current;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || drag.ignored || event.pointerId !== drag.pointerId) return;

      const dx = event.clientX - drag.startX;
      const dy = drag.startY - event.clientY; // finger up → positive (scroll down)
      if (!drag.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;

      // Horizontal chip strips: yield if the gesture is sideways.
      if (drag.fromChipStrip && !drag.moved) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          drag.ignored = true;
          drag.active = false;
          return;
        }
      }

      const inMainTouchScroll =
        event.pointerType !== "mouse" &&
        headerCollapseRef.current >= 1 &&
        scroller.scrollTop > 0 &&
        dy > 0 &&
        (event.target as HTMLElement | null)?.closest("main");
      if (inMainTouchScroll) {
        drag.active = false;
        return;
      }

      if (!drag.moved) {
        drag.moved = true;
        suppressClick = true;
        shell.setPointerCapture(event.pointerId);
        shell.classList.add("cursor-grabbing");
      }

      let collapse = drag.startCollapse;
      let scroll = drag.startScroll;
      let remaining = dy;

      if (remaining > 0 && collapse < 1) {
        const room = (1 - collapse) * COLLAPSE_PX;
        const take = Math.min(room, remaining);
        collapse += take / COLLAPSE_PX;
        remaining -= take;
      } else if (remaining < 0 && scroll <= 0 && collapse > 0) {
        const room = collapse * COLLAPSE_PX;
        const take = Math.min(room, -remaining);
        collapse -= take / COLLAPSE_PX;
        remaining += take;
      }

      publishCollapse(collapse);
      if (collapse >= 1) {
        scroller.scrollTop = Math.max(0, scroll + remaining);
      }
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      if ((!drag.active && !drag.ignored) || event.pointerId !== drag.pointerId) return;
      if (drag.moved && shell.hasPointerCapture(event.pointerId)) {
        shell.releasePointerCapture(event.pointerId);
      }
      drag.active = false;
      drag.ignored = false;
      shell.classList.remove("cursor-grabbing");
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    shell.addEventListener("wheel", onWheel, { passive: false });
    shell.addEventListener("pointerdown", onPointerDown);
    shell.addEventListener("pointermove", onPointerMove);
    shell.addEventListener("pointerup", endDrag);
    shell.addEventListener("pointercancel", endDrag);
    shell.addEventListener("click", onClickCapture, true);

    return () => {
      cancelAnimationFrame(frame);
      shell.removeEventListener("wheel", onWheel);
      shell.removeEventListener("pointerdown", onPointerDown);
      shell.removeEventListener("pointermove", onPointerMove);
      shell.removeEventListener("pointerup", endDrag);
      shell.removeEventListener("pointercancel", endDrag);
      shell.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  useEffect(() => {
    setPlaceholder(randomCategoryPlaceholder(rules));
    const tick = () => {
      setPlaceholder((current) => randomCategoryPlaceholder(rules, current));
    };
    const id = window.setInterval(tick, 3500);
    return () => window.clearInterval(id);
  }, [rules]);

  useEffect(() => {
    if (category !== "all" && !categories.includes(category)) {
      setCategory("all");
    }
  }, [categories, category]);

  useEffect(() => {
    const counts = sectionNameCounts(rules, category);
    if (sectionFilter !== "all" && (counts.bySection[sectionFilter] ?? 0) === 0) {
      setSectionFilter("all");
    }
  }, [sectionFilter, rules, category]);

  const hits = searchNames(query, rules);
  const pickedName = picked && hits.some((hit) => hit.name === picked) ? picked : null;
  const expanded = pickedName ?? (shouldExpand(hits) ? hits[0]?.name ?? null : null);
  const expandedVariants = expanded ? variantsForName(expanded, rules, pack) : [];
  const activeVariant = pickVariant(
    expandedVariants,
    sectionFilter !== "all" ? sectionFilter : preferredSection,
  );
  const expandedKinds = activeVariant ? lifeKindsForRule(activeVariant.rule) : [];
  const activeLife = pickLifeKind(
    expandedKinds,
    lifeFilter !== "all" ? lifeFilter : preferredLife,
  );
  const others = expanded ? hits.filter((hit) => hit.name !== expanded) : hits;

  function rememberSection(sectionId: SectionId) {
    setPreferredSection(sectionId);
    try {
      window.localStorage.setItem(LAST_SECTION_KEY, sectionId);
    } catch {
      // Ignore.
    }
  }

  function rememberLife(kind: LifeKind) {
    setPreferredLife(kind);
    try {
      window.localStorage.setItem(LAST_LIFE_KEY, kind);
    } catch {
      // Ignore.
    }
  }

  function choose(name: string, sectionId?: SectionId) {
    if (sectionId) rememberSection(sectionId);
    setQuery(name);
    setPicked(name);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.select());
  }

  // Shrink title first, then fade it out — list only scrolls after collapse ≈ 1.
  const titleShrink = Math.min(1, headerCollapse / 0.55);
  const titleFade = headerCollapse <= 0.55 ? 0 : (headerCollapse - 0.55) / 0.45;
  const titleScale = 1 - titleShrink * 0.42;
  const titleOpacity = 1 - titleFade;
  const titleGone = headerCollapse >= 0.98;
  const controlsDense = headerCollapse > 0.35;

  return (
    <div
      ref={shellRef}
      className="mx-auto flex h-dvh w-full max-w-md min-w-0 flex-col overflow-hidden overscroll-none"
    >
      <header className="shrink-0 border-b border-red-500/30 bg-[#0f1624] text-white">
        <div
          className={cn(
            "min-w-0 px-4 pt-[max(0.85rem,env(safe-area-inset-top))] transition-[padding,gap] duration-200",
            controlsDense ? "space-y-2 pb-2" : "space-y-3 pb-3",
          )}
        >
          <div
            className="overflow-hidden transition-[max-height,margin] duration-200 ease-out"
            style={{
              maxHeight: titleGone ? 0 : `${Math.round(96 * titleScale * titleOpacity + 4)}px`,
              marginBottom: titleGone ? 0 : undefined,
              opacity: titleOpacity,
            }}
            aria-hidden={titleGone}
          >
            <div
              className="flex origin-top-left items-start gap-3 will-change-transform"
              style={{
                transform: `scale(${titleScale})`,
                transformOrigin: "top left",
              }}
            >
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl leading-tight text-balance">
                  {chart.title}
                </h1>
                <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-red-300">
                  {chart.audience} · {chart.version}
                  {chart.issued
                    ? ` · Issued ${
                        compactDates
                          ? formatCompactDate(chart.issued)
                          : formatShortDate(chart.issued)
                      }`
                    : ""}
                  {imported ? " · imported" : ""}
                </p>
                {chart.validUntil ? (
                  <p className="mt-1 text-sm font-medium text-amber-200">
                    Valid until{" "}
                    <button
                      type="button"
                      onClick={toggleCompactDateFormat}
                      className="underline-offset-2 hover:underline"
                      aria-label={compactDates ? "Show full dates" : "Show short dates"}
                      tabIndex={titleGone ? -1 : undefined}
                    >
                      {compactDates
                        ? formatCompactDate(chart.validUntil)
                        : formatShortDate(chart.validUntil)}
                    </button>
                  </p>
                ) : null}
              </div>
              <ImportChartButton desk={desk} />
            </div>
          </div>

          <DateField
            label="Delivery date"
            value={deliveryDate}
            onChange={setDeliveryDate}
            onToday={() => setDeliveryDate(toIsoDate(new Date()))}
            dense={controlsDense}
          />
        </div>

        <div
          className={cn(
            "space-y-2 border-t border-white/10 px-4 transition-[padding] duration-200",
            controlsDense ? "pt-2 pb-2" : "pt-3 pb-3",
          )}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (hits[0]) choose(hits[0].name);
              requestAnimationFrame(() => inputRef.current?.select());
            }}
          >
            <div className="flex gap-2">
              <label
                htmlFor="product-search"
                className={cn(
                  "relative flex min-w-0 flex-1 items-center border border-white/10 bg-card shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] transition-all duration-200 focus-within:border-white/25 focus-within:ring-3 focus-within:ring-white/15",
                  controlsDense ? "h-10 rounded-xl" : "h-14 rounded-2xl",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none flex items-center text-stone-400 transition-all duration-200",
                    controlsDense ? "gap-1.5 pl-2.5" : "gap-2.5 pl-3.5",
                  )}
                  aria-hidden
                >
                  <Search className={cn("shrink-0 transition-all duration-200", controlsDense ? "size-3.5" : "size-4")} />
                  <span className={cn("w-px bg-white/20", controlsDense ? "h-4" : "h-5")} />
                </span>
                <Input
                  id="product-search"
                  ref={inputRef}
                  value={query}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="search"
                  aria-label="Search products"
                  placeholder={placeholder}
                  className={cn(
                    "flex-1 border-0 bg-transparent text-white shadow-none placeholder:text-stone-500 focus-visible:border-0 focus-visible:ring-0 transition-all duration-200",
                    controlsDense
                      ? "h-10 rounded-xl px-2 text-sm"
                      : "h-14 rounded-2xl px-3 text-base",
                  )}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPicked(null);
                  }}
                />
              </label>
              {query ? (
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "shrink-0 border-white/10 bg-card px-0 text-white transition-all duration-200",
                    controlsDense ? "h-10 w-10 rounded-xl" : "h-14 w-14 rounded-2xl",
                  )}
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    setPicked(null);
                    inputRef.current?.focus();
                  }}
                >
                  <X className={controlsDense ? "size-4" : undefined} />
                </Button>
              ) : null}
            </div>
          </form>

          {!query.trim() ? (
            <div className="space-y-2">
              <DragScroll role="group" aria-label="Product categories">
                <FilterChip selected={category === "all"} onClick={() => setCategory("all")}>
                  All <ChipCount value={categoryTotal} />
                </FilterChip>
                {categories.map((item) => (
                  <FilterChip
                    key={item}
                    selected={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item} <ChipCount value={categoryCounts[item] ?? 0} />
                  </FilterChip>
                ))}
              </DragScroll>
              <DragScroll role="group" aria-label="Storage filters">
                <FilterChip
                  selected={sectionFilter === "all"}
                  onClick={() => setSectionFilter("all")}
                >
                  Any <ChipCount value={storageCounts.all} />
                </FilterChip>
                {FILTER_SECTIONS.map((id) => {
                  const count = storageCounts.bySection[id] ?? 0;
                  if (count === 0) return null;
                  return (
                    <FilterChip
                      key={id}
                      selected={sectionFilter === id}
                      onClick={() => {
                        setSectionFilter(id);
                        rememberSection(id);
                      }}
                    >
                      {SECTION_TAG[id]} <ChipCount value={count} />
                    </FilterChip>
                  );
                })}
              </DragScroll>
              <DragScroll role="group" aria-label="Life date filters">
                <FilterChip selected={lifeFilter === "all"} onClick={() => setLifeFilter("all")}>
                  Any
                </FilterChip>
                {LIFE_KINDS.map((kind) => (
                  <FilterChip
                    key={kind}
                    selected={lifeFilter === kind}
                    onClick={() => {
                      setLifeFilter(kind);
                      rememberLife(kind);
                    }}
                  >
                    {LIFE_KIND_META[kind].filter}
                  </FilterChip>
                ))}
              </DragScroll>
            </div>
          ) : null}
        </div>
      </header>

      <main
        ref={mainRef}
        className="min-h-0 flex-1 cursor-grab overscroll-y-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] select-none"
        style={{ overflowY: headerCollapse >= 1 ? "auto" : "hidden" }}
      >
        {query.trim() && hits.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-white/20 bg-card/80 px-5 py-8 text-center">
            <span className="font-display text-2xl text-white">Not on this chart</span>
            <span className="mt-2 block text-sm text-stone-400">
              Nothing matches “{query.trim()}”.
            </span>
          </p>
        ) : null}

        {activeVariant ? (
          <div className="mt-4 space-y-3" aria-live="polite">
            {expandedVariants.length > 1 ? (
              <DragScroll role="group" aria-label="Storage tags" className="gap-1.5">
                {expandedVariants.map((variant) => {
                  const selected = variant.sectionId === activeVariant.sectionId;
                  return (
                    <button
                      key={variant.sectionId}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => rememberSection(variant.sectionId)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ring-1",
                        selected
                          ? "bg-white text-stone-950 ring-white"
                          : "bg-card text-stone-200 ring-white/15",
                      )}
                    >
                      {variant.tag}
                    </button>
                  );
                })}
              </DragScroll>
            ) : null}
            {expandedKinds.length > 1 ? (
              <DragScroll role="group" aria-label="Life date tags" className="gap-1.5">
                {expandedKinds.map((kind) => {
                  const selected = kind === activeLife;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => rememberLife(kind)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide ring-1",
                        selected
                          ? "bg-violet-300 text-violet-950 ring-violet-200"
                          : "bg-card text-stone-200 ring-white/15",
                      )}
                    >
                      {LIFE_KIND_META[kind].tag}
                    </button>
                  );
                })}
              </DragScroll>
            ) : null}
            <LifeCard
              key={`${activeVariant.rule.id}:${deliveryDate}:${activeLife ?? "all"}`}
              rule={activeVariant.rule}
              pack={pack}
              deliveryDate={deliveryDate}
              focusKind={activeLife}
            />
          </div>
        ) : null}

        {others.length > 0 ? (
          <div className="mt-4 rounded-2xl bg-card p-2 ring-1 ring-white/10">
            <p className="px-2 py-1 text-sm text-stone-400">
              {expanded ? "Also matches" : `${others.length} matches. Tap one.`}
            </p>
            <ul className="divide-y divide-white/10">
              {others.slice(0, 12).map((hit) => {
                const variants = variantsForName(hit.name, rules, pack);
                const preview = pickVariant(variants, preferredSection);
                return (
                  <li key={hit.name}>
                    <button
                      type="button"
                      onClick={() => choose(hit.name, preview?.sectionId)}
                      className="flex w-full flex-col gap-0.5 rounded-xl px-2 py-3 text-left active:bg-white/5"
                    >
                      <span className="font-medium text-white">{hit.name}</span>
                      <span className="text-sm text-stone-400">
                        {preview
                          ? `${preview.short} · ${preview.rule.prepped || preview.rule.fromDelivery || preview.rule.unopened}`
                          : rulesForName(hit.name, rules)[0]?.prepped}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!query.trim() ? (
          <ChartList
            pack={pack}
            category={category}
            deliveryDate={deliveryDate}
            today={today}
            sectionFilter={sectionFilter}
            lifeFilter={lifeFilter}
            preferredSection={preferredSection}
            preferredLife={preferredLife}
            onPreferredSection={rememberSection}
            onPreferredLife={rememberLife}
            onOpen={choose}
          />
        ) : null}

        {footnotes.length > 0 ? (
          <ul className="mt-8 space-y-2 text-sm text-stone-400">
            {footnotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}

function ChipCount({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center text-[0.7em] font-normal leading-none opacity-70">
      ({value})
    </span>
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
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-3.5 py-2 text-sm leading-none font-medium ring-1",
        selected
          ? "bg-white text-stone-950 ring-white"
          : "bg-card text-stone-200 ring-white/10",
      )}
    >
      {children}
    </button>
  );
}
