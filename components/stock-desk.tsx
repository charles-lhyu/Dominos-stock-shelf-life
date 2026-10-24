"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUp, List, RefreshCw, Search, Tags, Upload, X } from "lucide-react";
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
import {
  formatCompactDate,
  formatShortDate,
  isPastValidUntil,
  toIsoDate,
} from "@/lib/dates";
import {
  getDeskState,
  hydrateDeskStore,
  setDeliveryDate,
  subscribeDesk,
} from "@/lib/desk-store";
import { reloadAppToLatest, subscribeAppUpdateAvailable } from "@/lib/reload-app";
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
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  /** Title tucked away once the collapse gesture finishes. */
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  /** List only scrolls when collapsed and the header transition has settled. */
  const [listScrollable, setListScrollable] = useState(false);
  const [showGoTop, setShowGoTop] = useState(false);
  const [compactList, setCompactList] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const headerCollapsedRef = useRef(false);
  const listScrollableRef = useRef(false);
  const animatingRef = useRef(false);
  const collapseProgressRef = useRef(0);
  const settleTimerRef = useRef(0);
  const setHeaderModeRef = useRef<(collapsed: boolean) => void>(() => {});
  /** List place to restore when clearing a product opened from the chart. */
  const savedListScrollRef = useRef(0);
  const savedListCollapsedRef = useRef(false);
  /** Life filter before compact mode — restored when leaving compact. */
  const lifeFilterBeforeCompactRef = useRef<LifeKind | "all">("all");
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

  useEffect(() => subscribeAppUpdateAvailable(setAppUpdateAvailable), []);

  // Re-check chart expiry across midnight / long sessions.
  useEffect(() => {
    const refreshToday = () => setToday(new Date());
    const timer = window.setInterval(refreshToday, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshToday);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshToday);
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const list = mainRef.current;
    if (!shell || !list) return;
    const scroller: HTMLElement = list;

    // Gesture distance before flipping expand/collapse (list stays still).
    const COLLAPSE_AT = 96;
    const EXPAND_AT = 72;
    const SETTLE_MS = 320;

    let touchY = 0;
    let touchX = 0;
    let touchActive = false;
    let touchIgnored = false;
    let fromChipStrip = false;

    function setHeaderMode(collapsed: boolean) {
      window.clearTimeout(settleTimerRef.current);
      collapseProgressRef.current = 0;
      headerCollapsedRef.current = collapsed;
      animatingRef.current = true;
      listScrollableRef.current = false;
      setListScrollable(false);
      setHeaderCollapsed(collapsed);
      if (collapsed && !query.trim()) inputRef.current?.blur();
      if (!collapsed) setShowGoTop(false);

      settleTimerRef.current = window.setTimeout(() => {
        animatingRef.current = false;
        listScrollableRef.current = collapsed;
        setListScrollable(collapsed);
      }, SETTLE_MS);
    }

    setHeaderModeRef.current = setHeaderMode;

    function applyDelta(deltaY: number) {
      // deltaY > 0 → scroll down / collapse; < 0 → scroll up / expand
      if (animatingRef.current) return true;

      if (!headerCollapsedRef.current) {
        if (deltaY > 0) {
          collapseProgressRef.current += deltaY;
          if (collapseProgressRef.current >= COLLAPSE_AT) setHeaderMode(true);
        } else {
          collapseProgressRef.current = Math.max(0, collapseProgressRef.current + deltaY);
        }
        return true; // list locked while expanded
      }

      if (scroller.scrollTop <= 0 && deltaY < 0) {
        collapseProgressRef.current += -deltaY;
        if (collapseProgressRef.current >= EXPAND_AT) setHeaderMode(false);
        return true;
      }

      collapseProgressRef.current = 0;
      return false;
    }

    const onWheel = (event: WheelEvent) => {
      if (applyDelta(event.deltaY)) {
        event.preventDefault();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [data-go-top]")) {
        touchActive = false;
        return;
      }
      touchActive = true;
      touchIgnored = false;
      fromChipStrip = Boolean(target?.closest("[data-drag-scroll]"));
      touchX = event.touches[0].clientX;
      touchY = event.touches[0].clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchActive || touchIgnored || event.touches.length !== 1) return;

      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;
      const dx = x - touchX;
      const dy = touchY - y; // finger up → positive
      touchX = x;
      touchY = y;

      if (fromChipStrip && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        touchIgnored = true;
        return;
      }

      if (applyDelta(dy)) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      touchActive = false;
      touchIgnored = false;
    };

    shell.addEventListener("wheel", onWheel, { passive: false });
    shell.addEventListener("touchstart", onTouchStart, { passive: true });
    shell.addEventListener("touchmove", onTouchMove, { passive: false });
    shell.addEventListener("touchend", onTouchEnd);
    shell.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.clearTimeout(settleTimerRef.current);
      setHeaderModeRef.current = () => {};
      shell.removeEventListener("wheel", onWheel);
      shell.removeEventListener("touchstart", onTouchStart);
      shell.removeEventListener("touchmove", onTouchMove);
      shell.removeEventListener("touchend", onTouchEnd);
      shell.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [query]);

  useEffect(() => {
    const scroller = mainRef.current;
    if (!scroller) return;

    const syncGoTop = () => {
      setShowGoTop(headerCollapsedRef.current || scroller.scrollTop > 48);
    };

    scroller.addEventListener("scroll", syncGoTop, { passive: true });
    syncGoTop();
    return () => scroller.removeEventListener("scroll", syncGoTop);
  }, [headerCollapsed, listScrollable]);

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
    // Remember list place before the chart unmounts for this product.
    savedListScrollRef.current = mainRef.current?.scrollTop ?? 0;
    savedListCollapsedRef.current = headerCollapsedRef.current;
    setQuery(name);
    setPicked(name);
    inputRef.current?.blur();
    setSearchFocused(false);
  }

  function clearSearch() {
    setQuery("");
    setPicked(null);
    inputRef.current?.blur();
    setSearchFocused(false);

    const collapsed = savedListCollapsedRef.current;
    const top = savedListScrollRef.current;
    window.clearTimeout(settleTimerRef.current);
    collapseProgressRef.current = 0;
    animatingRef.current = false;
    headerCollapsedRef.current = collapsed;
    listScrollableRef.current = collapsed;
    setHeaderCollapsed(collapsed);
    setListScrollable(collapsed);
    setShowGoTop(collapsed || top > 48);

    // Wait for ChartList to mount, then jump back to the saved spot.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = mainRef.current;
        if (scroller) scroller.scrollTop = top;
      });
    });
  }

  function goToTop() {
    const scroller = mainRef.current;
    if (scroller) {
      // Jump instantly so expand isn't fighting a mid-scroll lock.
      scroller.scrollTop = 0;
    }
    // Always unfold the full header (not just the collapsed list top).
    setHeaderModeRef.current(false);
  }

  const hasChart = rules.length > 0;
  const browsing = hasChart && !query.trim();
  const chartExpired =
    Boolean(today) &&
    Boolean(chart.validUntil) &&
    isPastValidUntil(chart.validUntil, today ?? undefined);
  /** Collapsed idle: narrow search + full date. Focus/query: wide search + date icon. */
  const searchExpanded =
    !headerCollapsed || searchFocused || Boolean(query.trim());

  return (
    <div
      ref={shellRef}
      className="relative mx-auto flex h-full min-h-0 w-full max-w-md min-w-0 flex-col overflow-hidden overscroll-none"
    >
      <header className="relative z-20 shrink-0 bg-[#0f1624] text-white after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-2 after:border-t after:border-red-500/30 after:bg-[#0f1624]">
        <div
          className={cn(
            "min-w-0 space-y-2 px-4 pt-[max(0.85rem,env(safe-area-inset-top))] transition-[padding] duration-300",
            headerCollapsed ? "pb-2" : "pb-3",
          )}
        >
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              headerCollapsed
                ? "pointer-events-none grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
            aria-hidden={headerCollapsed}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={cn(
                  "flex origin-top items-start gap-3 pb-1 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  headerCollapsed ? "scale-[0.96]" : "scale-100",
                )}
              >
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-xl leading-tight text-balance">
                    {chart.title}
                  </h1>
                  {chart.audience || chart.version || chart.issued || imported ? (
                    <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-red-300">
                      {[
                        chart.audience,
                        chart.version,
                        chart.issued
                          ? `Issued ${
                              compactDates
                                ? formatCompactDate(chart.issued)
                                : formatShortDate(chart.issued)
                            }`
                          : "",
                        imported ? "imported" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Upload a chart to get started
                    </p>
                  )}
                  {chart.validUntil && !chartExpired ? (
                    <p className="mt-1 text-sm font-medium text-amber-200">
                      Valid until{" "}
                      <button
                        type="button"
                        onClick={toggleCompactDateFormat}
                        className="underline-offset-2 hover:underline"
                        aria-label={
                          compactDates ? "Show full dates" : "Show short dates"
                        }
                        tabIndex={headerCollapsed ? -1 : undefined}
                      >
                        {compactDates
                          ? formatCompactDate(chart.validUntil)
                          : formatShortDate(chart.validUntil)}
                      </button>
                    </p>
                  ) : null}
                  {chartExpired && chart.validUntil ? (
                    <p className="mt-1 text-sm font-medium text-amber-300">
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="text-left underline-offset-2 hover:underline"
                        aria-label="Chart expired — open settings to upload a new chart"
                        tabIndex={headerCollapsed ? -1 : undefined}
                      >
                        Expired{" "}
                        {compactDates
                          ? formatCompactDate(chart.validUntil)
                          : formatShortDate(chart.validUntil)}{" "}
                        — upload a new chart
                      </button>
                    </p>
                  ) : null}
                </div>
                {/* Extra padding so the update pulse isn’t clipped by collapse overflow. */}
                <div className="flex shrink-0 flex-col items-center gap-1 p-2">
                  <div className="flex items-center gap-2">
                    {chartExpired ? (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        aria-label="Upload a new chart"
                        title="Upload a new chart"
                        tabIndex={headerCollapsed ? -1 : undefined}
                        className="chart-update-pulse inline-flex size-11 shrink-0 items-center justify-center rounded-full"
                      >
                        <Upload className="size-5" aria-hidden />
                      </button>
                    ) : null}
                    {appUpdateAvailable ? (
                      <button
                        type="button"
                        disabled={updatingApp}
                        onClick={() => {
                          setUpdatingApp(true);
                          void reloadAppToLatest().finally(() => {
                            setUpdatingApp(false);
                          });
                        }}
                        aria-label="Update app"
                        title="Update app"
                        tabIndex={headerCollapsed ? -1 : undefined}
                        className="chart-update-pulse inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-70"
                      >
                        <RefreshCw
                          className={cn("size-5", updatingApp && "animate-spin")}
                          aria-hidden
                        />
                      </button>
                    ) : null}
                    <ImportChartButton
                      desk={desk}
                      open={settingsOpen}
                      onOpenChange={setSettingsOpen}
                    />
                  </div>
                  <span className="font-mono text-sm tracking-wide text-stone-500">
                    v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.3.0"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {headerCollapsed && chartExpired && chart.validUntil ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="block w-full truncate text-left text-xs font-medium text-amber-300 underline-offset-2 hover:underline"
              aria-label="Chart expired — open settings to upload a new chart"
            >
              Expired{" "}
              {compactDates
                ? formatCompactDate(chart.validUntil)
                : formatShortDate(chart.validUntil)}{" "}
              — upload a new chart
            </button>
          ) : null}

          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              headerCollapsed
                ? "pointer-events-none grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
            aria-hidden={headerCollapsed}
          >
            <div className="min-h-0 overflow-hidden">
              <DateField
                label="Delivery date"
                value={deliveryDate}
                onChange={setDeliveryDate}
                onToday={() => setDeliveryDate(toIsoDate(new Date()))}
              />
            </div>
          </div>

          <div
            className={cn(
              "flex items-stretch gap-2 border-white/10 transition-[padding,border-color] duration-300",
              headerCollapsed ? "border-t-0 pt-0" : "border-t pt-3",
            )}
          >
            <form
              className="min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (hits[0]) choose(hits[0].name);
              }}
            >
              <div className="flex gap-2">
                <label
                  htmlFor="product-search"
                  className={cn(
                    "relative flex min-w-0 flex-1 items-center border border-white/10 bg-card shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:border-white/25 focus-within:ring-3 focus-within:ring-white/15",
                    headerCollapsed ? "h-10 rounded-xl" : "h-14 rounded-2xl",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none flex items-center text-stone-400 transition-all duration-300",
                      headerCollapsed ? "gap-1.5 pl-2.5" : "gap-2.5 pl-3.5",
                    )}
                    aria-hidden
                  >
                    <Search
                      className={cn(
                        "shrink-0 transition-all duration-300",
                        headerCollapsed ? "size-3.5" : "size-4",
                      )}
                    />
                    <span
                      className={cn(
                        "w-px bg-white/20 transition-all duration-300",
                        headerCollapsed ? "h-4" : "h-5",
                      )}
                    />
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
                    placeholder={
                      headerCollapsed && !searchExpanded ? "Search…" : placeholder
                    }
                    className={cn(
                      "flex-1 border-0 bg-transparent text-white shadow-none placeholder:text-stone-500 focus-visible:border-0 focus-visible:ring-0 transition-all duration-300",
                      headerCollapsed
                        ? "h-10 rounded-xl px-2 text-sm"
                        : "h-14 rounded-2xl px-3 text-base",
                    )}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!query.trim() && next.trim()) {
                        savedListScrollRef.current = mainRef.current?.scrollTop ?? 0;
                        savedListCollapsedRef.current = headerCollapsedRef.current;
                      }
                      setQuery(next);
                      setPicked(null);
                    }}
                  />
                </label>
                {query ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "shrink-0 border-white/10 bg-card px-0 text-white transition-all duration-300",
                      headerCollapsed ? "h-10 w-10 rounded-xl" : "h-14 w-14 rounded-2xl",
                    )}
                    aria-label="Clear search"
                    onClick={clearSearch}
                  >
                    <X className={headerCollapsed ? "size-4" : undefined} />
                  </Button>
                ) : null}
              </div>
            </form>

            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 self-stretch transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                !headerCollapsed
                  ? "pointer-events-none max-w-0 overflow-hidden opacity-0"
                  : "max-w-[18rem] opacity-100",
              )}
              aria-hidden={!headerCollapsed}
            >
              <DateField
                value={deliveryDate}
                onChange={setDeliveryDate}
                dense
                iconOnly={headerCollapsed && searchExpanded}
                className={headerCollapsed && searchExpanded ? undefined : "w-max"}
                onIconActivate={() => {
                  setSearchFocused(false);
                  inputRef.current?.blur();
                }}
              />
              {chartExpired ? (
                <button
                  type="button"
                  tabIndex={headerCollapsed ? undefined : -1}
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Upload a new chart"
                  title="Upload a new chart"
                  className={cn(
                    "chart-update-pulse flex shrink-0 items-center justify-center rounded-xl",
                    headerCollapsed && searchExpanded ? "size-10" : "h-10 w-10",
                  )}
                >
                  <Upload className="size-4" strokeWidth={2.25} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          {browsing ? (
            <div
              className={cn(
                // Clear the expanded search bar’s 4px hard shadow so category chips aren’t covered.
                "relative",
                !headerCollapsed && "pt-2",
              )}
            >
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  headerCollapsed
                    ? "pointer-events-none grid-rows-[0fr] opacity-0"
                    : "grid-rows-[1fr] opacity-100",
                )}
                aria-hidden={headerCollapsed}
              >
                <div className="min-h-0 space-y-2 overflow-hidden">
                  <DragScroll role="group" aria-label="Product categories">
                    <FilterChip
                      selected={category === "all"}
                      onClick={() => setCategory("all")}
                    >
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
                  {!compactList ? (
                    <DragScroll role="group" aria-label="Life date filters">
                      <FilterChip
                        selected={lifeFilter === "all"}
                        onClick={() => setLifeFilter("all")}
                      >
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
                  ) : null}
                </div>
              </div>

              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  headerCollapsed
                    ? "grid-rows-[1fr] opacity-100 delay-75"
                    : "pointer-events-none grid-rows-[0fr] opacity-0",
                )}
                aria-hidden={!headerCollapsed}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "grid gap-1.5",
                      compactList ? "grid-cols-2" : "grid-cols-3",
                    )}
                  >
                    <FilterSelect
                      aria-label="Product category"
                      value={category}
                      onChange={(value) => setCategory(value as string | "all")}
                    >
                      <option value="all">All ({categoryTotal})</option>
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item} ({categoryCounts[item] ?? 0})
                        </option>
                      ))}
                    </FilterSelect>
                    <FilterSelect
                      aria-label="Storage"
                      value={sectionFilter}
                      onChange={(value) => {
                        const next = value as SectionId | "all";
                        setSectionFilter(next);
                        if (next !== "all") rememberSection(next);
                      }}
                    >
                      <option value="all">Any ({storageCounts.all})</option>
                      {FILTER_SECTIONS.map((id) => {
                        const count = storageCounts.bySection[id] ?? 0;
                        if (count === 0) return null;
                        return (
                          <option key={id} value={id}>
                            {SECTION_TAG[id]} ({count})
                          </option>
                        );
                      })}
                    </FilterSelect>
                    {!compactList ? (
                      <FilterSelect
                        aria-label="Life date"
                        value={lifeFilter}
                        onChange={(value) => {
                          const next = value as LifeKind | "all";
                          setLifeFilter(next);
                          if (next !== "all") rememberLife(next);
                        }}
                      >
                        <option value="all">Any</option>
                        {LIFE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {LIFE_KIND_META[kind].filter}
                          </option>
                        ))}
                      </FilterSelect>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main
        ref={mainRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col overscroll-y-contain bg-[#0f1624] px-4 pt-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]",
          listScrollable ? "overflow-y-auto" : "overflow-y-hidden",
        )}
      >
        {!hasChart ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="my-3 flex min-h-0 w-full flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-card/80 px-5 py-10 text-center active:bg-white/[0.06]"
          >
            <span className="font-display text-2xl text-white">No chart loaded</span>
            <span className="mt-2 block text-sm text-stone-400">
              Tap here to open settings and upload a chart.
            </span>
          </button>
        ) : null}

        {hasChart && query.trim() && hits.length === 0 ? (
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

        {hasChart && !query.trim() ? (
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
            onLifeFilter={(kind) => {
              setLifeFilter(kind);
              rememberLife(kind);
            }}
            onOpen={choose}
            compact={compactList}
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

      {hasChart && !query.trim() ? (
        <button
          type="button"
          data-go-top=""
          aria-label={compactList ? "Show tags" : "Compact list without tags"}
          aria-pressed={compactList}
          onClick={() => {
            const enabling = !compactList;
            if (enabling) {
              lifeFilterBeforeCompactRef.current = lifeFilter;
              setCompactList(true);
              // Compact has no "Any" — default to Delivery without overwriting preference.
              if (lifeFilter === "all") setLifeFilter("stock");
            } else {
              setCompactList(false);
              setLifeFilter(lifeFilterBeforeCompactRef.current);
            }
          }}
          className={cn(
            "absolute right-4 z-20 flex size-11 items-center justify-center rounded-full text-stone-950 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ring-1 backdrop-blur-sm transition-all duration-200",
            "bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.25rem)]",
            "hover:bg-white hover:opacity-100 focus-visible:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:bg-white active:opacity-100",
            compactList
              ? "bg-white opacity-100 ring-black/10"
              : "bg-white/40 opacity-45 ring-white/20",
          )}
        >
          {compactList ? (
            <Tags className="size-5" strokeWidth={2.5} />
          ) : (
            <List className="size-5" strokeWidth={2.5} />
          )}
        </button>
      ) : null}

      <button
        type="button"
        data-go-top=""
        aria-label="Go to top"
        onClick={goToTop}
        className={cn(
          "absolute right-4 z-20 flex size-11 items-center justify-center rounded-full bg-white/40 text-stone-950 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ring-1 ring-white/20 backdrop-blur-sm transition-all duration-200",
          "hover:bg-white hover:opacity-100 hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)] focus-visible:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:bg-white active:opacity-100",
          "bottom-[max(1rem,env(safe-area-inset-bottom))]",
          showGoTop
            ? "translate-y-0 opacity-45"
            : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <ArrowUp className="size-5" strokeWidth={2.5} />
      </button>
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

function FilterSelect({
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  "aria-label": string;
}) {
  return (
    <label className="relative min-w-0">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full appearance-none truncate rounded-xl border border-white/10 bg-card py-0 pr-7 pl-2 text-xs font-medium text-white outline-none focus-visible:border-white/25 focus-visible:ring-2 focus-visible:ring-white/15"
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-stone-400"
        aria-hidden
      >
        <svg viewBox="0 0 12 12" className="size-3 fill-current">
          <path d="M2.2 4.2a.75.75 0 0 1 1.06 0L6 6.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L2.2 5.26a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </span>
    </label>
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
