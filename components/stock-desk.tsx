"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUp,
  List,
  RefreshCw,
  Search,
  Tags,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { ChartList } from "@/components/chart-list";
import { CollapsedDateTime } from "@/components/date-field";
import { DragScroll } from "@/components/drag-scroll";
import { ImportChartButton } from "@/components/import-chart";
import { LifeCard } from "@/components/life-card";
import { UpdateConfirmDialog } from "@/components/update-confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dismissTopDialog, hasOpenDialog, nextBackAction } from "@/lib/back-button";
import {
  captureActiveCampaign,
  hydrateCampaignLibrary,
  listStoreNames,
  listStoreNamesServer,
  subscribeCampaignLibrary,
} from "@/lib/campaign-library";
import { getCompactList, setCompactList, subscribeCompactList } from "@/lib/compact-list-store";
import { formatAppVersion } from "@/lib/changelog";
import {
  daysBetween,
  formatCompactDate,
  isPastValidUntil,
  parseIsoDate,
  toIsoDate,
} from "@/lib/dates";
import {
  getDeskState,
  hydrateDeskStore,
  setDeliveryDate,
  setPrepTime,
  subscribeDesk,
} from "@/lib/desk-store";
import {
  getHiddenEntries,
  getHiddenEntriesServer,
  isHiddenProduct,
  isHiddenSection,
  subscribeHidden,
} from "@/lib/hidden-store";
import { chartProductDefaults } from "@/lib/invalid-presets";
import {
  getItemPreset,
  getItemPresetServer,
  hydrateItemPresetStore,
  setPresetCategory,
  setProductDefault,
  setPresetLifeFilter,
  setPresetSectionFilter,
  subscribeItemPreset,
} from "@/lib/item-preset-store";
import {
  getStoreId,
  getStoreIdServer,
  hydrateStoreIdStore,
  subscribeStoreId,
} from "@/lib/store-id-store";
import {
  appVersionLabel,
  localAppVersion,
  reloadAppToLatest,
  subscribeAppUpdateAvailable,
  type AppUpdateInfo,
} from "@/lib/reload-app";
import {
  calculatedLifeKind,
  categoriesInPack,
  isNewCategoryFilter,
  NEW_CATEGORY_FILTER,
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
import { toast } from "sonner";

/** Warn when delivery/prep is further than this many days from today. */
const FAR_DATE_DAYS = 14;

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

export function StockDesk() {
  const desk = useSyncExternalStore(subscribeDesk, getDeskState, getDeskState);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  /** Session-only life on the open item — never written to product defaults. */
  const [detailLife, setDetailLife] = useState<LifeKind | null>(null);
  /** Shared list life pick while filter is "all" — applies to every item that supports it. */
  const [sessionLife, setSessionLife] = useState<LifeKind | null>(null);
  const preset = useSyncExternalStore(
    subscribeItemPreset,
    () => {
      hydrateItemPresetStore();
      return getItemPreset();
    },
    getItemPresetServer,
  );
  const category = preset.category;
  const sectionFilter = preset.sectionFilter;
  const [placeholder, setPlaceholder] = useState("Pepperoni, Chorizo, Nduja Sausage…");
  const [today, setToday] = useState<Date | null>(null);
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo>({
    available: false,
    localVersion: localAppVersion(),
    remoteVersion: null,
    remoteNotes: [],
  });
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [dateError, setDateError] = useState<"future" | "far" | null>(null);
  /** Title tucked away once the collapse gesture finishes. */
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  /** List only scrolls when collapsed and the header transition has settled. */
  const [listScrollable, setListScrollable] = useState(false);
  const [showGoTop, setShowGoTop] = useState(false);
  const compactList = useSyncExternalStore(subscribeCompactList, getCompactList, () => false);
  const lifeFilter =
    compactList && preset.lifeFilter === "all" ? "stock" : preset.lifeFilter;
  useEffect(() => {
    if (lifeFilter !== "all") setSessionLife(null);
  }, [lifeFilter]);

  function preferLife(kind: LifeKind) {
    setDetailLife(kind);
    if (lifeFilter !== "all") setPresetLifeFilter(kind);
    else setSessionLife(kind);
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Keep FABs unmounted until Settings finish closing so they don't jump. */
  const [overlayButtonsReady, setOverlayButtonsReady] = useState(true);
  const overlayButtonsTimerRef = useRef(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const headerCollapsedRef = useRef(false);
  const listScrollableRef = useRef(false);
  const animatingRef = useRef(false);
  const collapseProgressRef = useRef(0);
  const settleTimerRef = useRef(0);
  /** Item details stay collapsed — scroll-up must not reopen the Campaign title. */
  const itemDetailsOpenRef = useRef(false);
  const setHeaderModeRef = useRef<(collapsed: boolean) => void>(() => {});
  /** List place to restore when clearing a product opened from the chart. */
  const savedListScrollRef = useRef(0);
  const backRef = useRef({
    settingsOpen: false,
    itemOpen: false,
    closeSettings: () => {},
    leaveItem: () => {},
  });
  /** Set inside choose() so the next layout scrolls that product to the top once. */
  const showItemFromTopRef = useRef(false);
  const { pack, deliveryDate, prepTime, imported } = desk;
  const { chart, footnotes, rules } = pack;
  const hiddenEntries = useSyncExternalStore(
    subscribeHidden,
    getHiddenEntries,
    getHiddenEntriesServer,
  );
  const storeId = useSyncExternalStore(
    subscribeStoreId,
    () => {
      hydrateStoreIdStore();
      return getStoreId();
    },
    getStoreIdServer,
  );
  const storeNames = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listStoreNames();
    },
    listStoreNamesServer,
  );
  const storeName = storeId ? (storeNames[storeId] ?? "") : "";
  // List matching uses chart titles; raw old labels stay in storage for Settings.
  const productDefaults = chartProductDefaults(preset.defaults, rules, hiddenEntries);
  const visibleRules = rules.filter(
    (rule) => !isHiddenSection(rule.name, rule.sectionId),
  );
  const categories = categoriesInPack(pack).filter((item) =>
    visibleRules.some((rule) => rule.category === item),
  );
  const categoryCounts = Object.fromEntries(
    categories.map((item) => [
      item,
      uniqueNamesInCategory(visibleRules, item).length,
    ]),
  ) as Record<string, number>;
  const categoryTotal = uniqueNamesInCategory(visibleRules, "all").length;
  const newCategoryCount = uniqueNamesInCategory(visibleRules, NEW_CATEGORY_FILTER).length;
  const storageCounts = sectionNameCounts(visibleRules, category);

  useEffect(() => {
    hydrateDeskStore();
    hydrateStoreIdStore();
    hydrateItemPresetStore();
    captureActiveCampaign();
    setToday(new Date());
  }, []);

  useEffect(() => subscribeAppUpdateAvailable(setAppUpdate), []);

  const appUpdateAvailable = appUpdate.available;
  const updateLabel =
    appUpdate.remoteVersion != null
      ? `Update available · ${formatAppVersion(appUpdate.localVersion)} → ${formatAppVersion(appUpdate.remoteVersion)}`
      : "Update available";

  function openUpdateConfirm() {
    if (!appUpdate.available || !appUpdate.remoteVersion) return;
    setUpdateConfirmOpen(true);
  }

  function confirmAppUpdate() {
    setUpdatingApp(true);
    void reloadAppToLatest().finally(() => {
      setUpdatingApp(false);
      setUpdateConfirmOpen(false);
    });
  }

  function dateErrorFor(iso: string, from: Date): "future" | "far" | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const todayIso = toIsoDate(from);
    if (iso > todayIso) return "future";
    if (Math.abs(daysBetween(from, parseIsoDate(iso))) > FAR_DATE_DAYS) {
      return "far";
    }
    return null;
  }

  function onDeliveryDateChange(next: string) {
    setDeliveryDate(next);
    setDateError(dateErrorFor(next, today ?? new Date()));
  }

  function setSettingsOpenSafe(open: boolean) {
    setSettingsOpen(open);
    if (overlayButtonsTimerRef.current) {
      window.clearTimeout(overlayButtonsTimerRef.current);
      overlayButtonsTimerRef.current = 0;
    }
    if (open) {
      setOverlayButtonsReady(false);
      return;
    }
    // Wait for the dialog close animation before bringing FABs back.
    overlayButtonsTimerRef.current = window.setTimeout(() => {
      setOverlayButtonsReady(true);
      overlayButtonsTimerRef.current = 0;
    }, 180);
  }

  useEffect(
    () => () => {
      if (overlayButtonsTimerRef.current) {
        window.clearTimeout(overlayButtonsTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
      setDateError(null);
      return;
    }
    setDateError(dateErrorFor(deliveryDate, today));
  }, [deliveryDate, today]);

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
      // Details keep the compact header — ignore expand requests until Back.
      if (!collapsed && itemDetailsOpenRef.current) return;
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
        // Item details: keep the compact header; do not pull the titles back open.
        if (itemDetailsOpenRef.current) {
          collapseProgressRef.current = 0;
          return true;
        }
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
      if (target?.closest("input, textarea, select, button, [data-go-top], [data-no-collapse]")) {
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
    if (
      category !== "all" &&
      !isNewCategoryFilter(category) &&
      !categories.includes(category)
    ) {
      setPresetCategory("all");
    }
    if (isNewCategoryFilter(category) && newCategoryCount === 0) {
      setPresetCategory("all");
    }
  }, [categories, category, newCategoryCount]);

  useEffect(() => {
    const counts = sectionNameCounts(rules, category);
    if (sectionFilter !== "all" && (counts.bySection[sectionFilter] ?? 0) === 0) {
      setPresetSectionFilter("all");
    }
  }, [sectionFilter, rules, category]);

  // choose() saves the list offset, then this runs after the product is in the
  // DOM and before paint. Search keystrokes never set the flag.
  useLayoutEffect(() => {
    if (!showItemFromTopRef.current) return;
    showItemFromTopRef.current = false;
    const scroller = mainRef.current;
    if (scroller) scroller.scrollTop = 0;
  });

  const hits = searchNames(query, rules).filter((hit) => {
    if (hit.name === picked) return true;
    const sections = rules
      .filter((rule) => rule.name === hit.name)
      .map((rule) => rule.sectionId);
    return !isHiddenProduct(hit.name, sections);
  });
  // Picked details stay open with an empty search box (choose no longer fills the query).
  const pickedName =
    picked && rulesForName(picked, rules).length > 0
      ? !query.trim() || hits.some((hit) => hit.name === picked)
        ? picked
        : null
      : null;
  const expanded = pickedName ?? (shouldExpand(hits) ? hits[0]?.name ?? null : null);
  const expandedVariants = expanded ? variantsForName(expanded, rules, pack) : [];
  const expandedDefault = expanded ? productDefaults[expanded] : undefined;
  // Storage default first; list filter fills in when that product has no saved storage.
  const activeVariant = pickVariant(
    expandedVariants,
    expandedDefault?.section ??
      (sectionFilter !== "all" ? sectionFilter : null),
  );
  const expandedKinds = activeVariant ? lifeKindsForRule(activeVariant.rule) : [];
  const activeLife = pickLifeKind(
    expandedKinds,
    detailLife ??
      (lifeFilter !== "all" ? lifeFilter : null) ??
      sessionLife ??
      (activeVariant ? calculatedLifeKind(activeVariant.rule) : null),
  );
  const others = expanded ? hits.filter((hit) => hit.name !== expanded) : hits;

  function choose(name: string, sectionId?: SectionId) {
    if (sectionId) setProductDefault(name, { section: sectionId });
    // Snapshot the list only while it is still showing. A product opened from
    // "also matches" must not replace that place with the detail's scroll.
    if (!picked) {
      savedListScrollRef.current = mainRef.current?.scrollTop ?? 0;
    }
    // Item details keep the compact header (Campaign title strip stays hidden).
    // Leave the search box empty — details are driven by `picked`, not the query.
    setHeaderModeRef.current(true);
    showItemFromTopRef.current = true;
    setQuery("");
    setPicked(name);
    setDetailLife(null);
    inputRef.current?.blur();
    setSearchFocused(false);
  }

  function clearSearch() {
    setQuery("");
    setPicked(null);
    setDetailLife(null);
    inputRef.current?.blur();
    setSearchFocused(false);

    // Stay collapsed after leaving details — do not reopen the Campaign title strip.
    const top = savedListScrollRef.current;
    window.clearTimeout(settleTimerRef.current);
    collapseProgressRef.current = 0;
    animatingRef.current = false;
    headerCollapsedRef.current = true;
    listScrollableRef.current = true;
    setHeaderCollapsed(true);
    setListScrollable(true);
    setShowGoTop(top > 48);

    // Wait for ChartList to mount, then jump back to the saved spot.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = mainRef.current;
        if (scroller) scroller.scrollTop = top;
      });
    });
  }

  backRef.current = {
    settingsOpen,
    itemOpen: Boolean(picked) || Boolean(query.trim()),
    closeSettings: () => setSettingsOpenSafe(false),
    leaveItem: clearSearch,
  };

  useEffect(() => {
    const EXIT_MS = 2000;
    let exitArmed = false;
    let exitTimer = 0;
    let exiting = false;

    function stay() {
      window.clearTimeout(exitTimer);
      exitArmed = false;
      history.pushState({ shelfBack: 1 }, "");
    }

    function onPopState() {
      if (exiting) return;
      const current = backRef.current;
      const action = nextBackAction({
        dialogOpen: current.settingsOpen || hasOpenDialog(),
        itemOpen: current.itemOpen,
        exitArmed,
      });
      if (action === "close-dialog") {
        if (!dismissTopDialog()) current.closeSettings();
        stay();
        return;
      }
      if (action === "leave-item") {
        current.leaveItem();
        stay();
        return;
      }
      if (action === "arm-exit") {
        exitArmed = true;
        toast("Press back again to close", { id: "back-exit", duration: EXIT_MS });
        history.pushState({ shelfBack: 1 }, "");
        window.clearTimeout(exitTimer);
        exitTimer = window.setTimeout(() => {
          exitArmed = false;
        }, EXIT_MS);
        return;
      }
      exiting = true;
      window.setTimeout(() => history.back(), 0);
    }

    window.addEventListener("popstate", onPopState);
    if (!history.state || (history.state as { shelfBack?: number }).shelfBack !== 1) {
      history.pushState({ shelfBack: 1 }, "");
    }
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.clearTimeout(exitTimer);
    };
  }, []);

  function goToTop() {
    const scroller = mainRef.current;
    if (scroller) {
      // Jump instantly so expand isn't fighting a mid-scroll lock.
      scroller.scrollTop = 0;
    }
    // Item details stay collapsed; list go-top unfolds the Campaign title strip.
    if (!itemDetailsOpenRef.current) setHeaderModeRef.current(false);
  }

  const hasChart = rules.length > 0;
  const itemOpen = Boolean(picked);
  itemDetailsOpenRef.current = itemOpen;
  const browsing = hasChart && !itemOpen && !query.trim();
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
        <div className="flex min-w-0 items-center gap-2 border-b border-white/10 px-4 pt-[max(0.3rem,env(safe-area-inset-top))] pb-1">
          <button
            type="button"
            onClick={() => setSettingsOpenSafe(true)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
            aria-label={
              storeId
                ? storeName
                  ? `${storeName}, store ${storeId}`
                  : `Store ${storeId}`
                : "Store ID not set"
            }
          >
            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Store
            </span>
            <span
              className={cn(
                "min-w-0 truncate text-sm font-medium",
                storeName || storeId ? "text-white" : "text-stone-500",
                storeName ? "" : "font-mono",
              )}
            >
              {storeName || storeId || "Not set"}
            </span>
            {storeName && storeId ? (
              <span className="shrink-0 font-mono text-xs text-stone-400">{storeId}</span>
            ) : null}
          </button>
          <ImportChartButton
            desk={desk}
            open={settingsOpen}
            onOpenChange={setSettingsOpenSafe}
            onOpenProduct={(name) => {
              setSettingsOpenSafe(false);
              choose(name);
            }}
            compact
          />
        </div>
        {appUpdateAvailable ? (
          <button
            type="button"
            disabled={updatingApp}
            onClick={openUpdateConfirm}
            className="flex w-full items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-sm font-semibold text-orange-950 transition-colors hover:bg-orange-400 active:bg-orange-600 disabled:opacity-70"
            aria-label={`${updateLabel} — tap to review and update`}
          >
            <RefreshCw
              className={cn("size-3.5 shrink-0", updatingApp && "animate-spin")}
              aria-hidden
            />
            <span className="min-w-0 truncate">
              {updatingApp ? "Updating…" : updateLabel}
            </span>
          </button>
        ) : null}

        <div
          className={cn(
            "min-w-0 space-y-2 px-4 transition-[padding] duration-300",
            headerCollapsed ? "pt-2 pb-2" : "pt-2 pb-3",
          )}
        >
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              headerCollapsed
                ? "pointer-events-none my-0! grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
            aria-hidden={headerCollapsed}
          >
            <div
              className={cn(
                "min-h-0",
                headerCollapsed ? "overflow-hidden" : "overflow-visible",
              )}
            >
              <div
                className={cn(
                  "flex origin-top items-start gap-3 pb-1 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  headerCollapsed ? "scale-[0.96]" : "scale-100",
                )}
              >
                <div className="min-w-0 flex-1 overflow-visible pt-0.5">
                  <h1 className="font-display text-xl leading-[1.2] text-balance [overflow-wrap:anywhere]">
                    {storeName ? (
                      <span className="mb-1 block text-base font-medium tracking-normal text-stone-200">
                        {storeName}
                      </span>
                    ) : null}
                    {chart.title}
                  </h1>
                  {chart.audience || chart.version || chart.issued ? (
                    <p className="mt-1.5 text-[0.65rem] font-semibold uppercase leading-relaxed tracking-[0.14em] text-red-300">
                      {[
                        chart.audience,
                        chart.version,
                        chart.issued
                          ? `Issued ${formatCompactDate(chart.issued)}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : !imported ? (
                    <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Upload a chart to get started
                    </p>
                  ) : null}
                  {chart.validUntil && !chartExpired ? (
                    <p className="mt-1 text-sm font-medium leading-snug text-amber-200">
                      Valid until {formatCompactDate(chart.validUntil)}
                    </p>
                  ) : null}
                  {chartExpired && chart.validUntil ? (
                    <p className="mt-1 text-sm font-medium text-amber-300">
                      <button
                        type="button"
                        onClick={() => setSettingsOpenSafe(true)}
                        className="text-left underline-offset-2 hover:underline"
                        aria-label="Chart expired — open settings to upload a new chart"
                        tabIndex={headerCollapsed ? -1 : undefined}
                      >
                        Expired {formatCompactDate(chart.validUntil)} — upload a
                        new chart
                      </button>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
                  {chartExpired ? (
                    <button
                      type="button"
                      onClick={() => setSettingsOpenSafe(true)}
                      aria-label="Upload a new chart"
                      title="Upload a new chart"
                      tabIndex={headerCollapsed ? -1 : undefined}
                      className="chart-update-pulse inline-flex size-11 shrink-0 items-center justify-center rounded-full"
                    >
                      <Upload className="size-5" aria-hidden />
                    </button>
                  ) : null}
                  <span className="font-mono text-sm tracking-wide text-stone-500">
                    {appVersionLabel()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {headerCollapsed && chartExpired && chart.validUntil ? (
            <button
              type="button"
              onClick={() => setSettingsOpenSafe(true)}
              className="block w-full truncate text-left text-xs font-medium text-amber-300 underline-offset-2 hover:underline"
              aria-label="Chart expired — open settings to upload a new chart"
            >
              Expired {formatCompactDate(chart.validUntil)} — upload a new chart
            </button>
          ) : null}

          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              headerCollapsed
                ? "pointer-events-none my-0! grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
            aria-hidden={headerCollapsed}
          >
            <div
              className={cn(
                "min-h-0",
                headerCollapsed ? "overflow-hidden" : "overflow-visible",
              )}
            >
              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-medium tracking-wide text-stone-400">
                  Delivery/Prep Date
                </p>
                <CollapsedDateTime
                  date={deliveryDate}
                  onDateChange={onDeliveryDateChange}
                  time={prepTime}
                  onTimeChange={setPrepTime}
                  fill
                  shortWeekday
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "flex items-stretch gap-2 border-white/10 transition-[padding,border-color,margin] duration-300",
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
              <label
                htmlFor="product-search"
                className={cn(
                  "relative flex min-w-0 flex-1 items-center rounded-xl border border-white/10 bg-card shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:border-white/25 focus-within:ring-3 focus-within:ring-white/15",
                  headerCollapsed ? "h-9" : "h-10",
                )}
              >
                <span
                  className="pointer-events-none flex items-center gap-1.5 pl-2.5 text-stone-400"
                  aria-hidden
                >
                  <Search className="size-3.5 shrink-0" />
                  <span className="h-4 w-px bg-white/20" />
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
                    "min-w-0 flex-1 rounded-xl border-0 bg-transparent py-0 pr-9 pl-2 text-sm text-white shadow-none placeholder:text-stone-500 focus-visible:border-0 focus-visible:ring-0 transition-all duration-300",
                    headerCollapsed ? "h-9" : "h-10",
                  )}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!picked && !query.trim() && next.trim()) {
                      savedListScrollRef.current = mainRef.current?.scrollTop ?? 0;
                    }
                    setQuery(next);
                    setPicked(null);
                  }}
                />
                <button
                  type="button"
                  aria-label={picked ? "Close item" : "Clear search"}
                  disabled={!query.trim() && !picked}
                  tabIndex={-1}
                  className={cn(
                    "absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg transition-[opacity,background-color,color] duration-200",
                    !query.trim() && !picked
                      ? "pointer-events-none text-white opacity-35"
                      : searchFocused || picked
                        ? "text-red-300 opacity-100 hover:bg-red-500/30 hover:text-red-200"
                        : "text-red-400 opacity-40 hover:bg-red-500/25 hover:text-red-300 hover:opacity-100",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearSearch}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </label>
            </form>

            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 self-stretch transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                !headerCollapsed
                  ? "pointer-events-none max-w-0 overflow-hidden opacity-0"
                  : "max-w-[24rem] opacity-100",
              )}
              aria-hidden={!headerCollapsed}
            >
              <CollapsedDateTime
                date={deliveryDate}
                onDateChange={onDeliveryDateChange}
                time={prepTime}
                onTimeChange={setPrepTime}
                iconOnly={headerCollapsed && searchExpanded}
                onIconActivate={() => {
                  setSearchFocused(false);
                  inputRef.current?.blur();
                }}
              />
              {chartExpired ? (
                <button
                  type="button"
                  tabIndex={headerCollapsed ? undefined : -1}
                  onClick={() => setSettingsOpenSafe(true)}
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
                      onClick={() => setPresetCategory("all")}
                    >
                      All <ChipCount value={categoryTotal} />
                    </FilterChip>
                    {categories.map((item) => (
                      <FilterChip
                        key={item}
                        selected={category === item}
                        onClick={() => setPresetCategory(item)}
                      >
                        {item} <ChipCount value={categoryCounts[item] ?? 0} />
                      </FilterChip>
                    ))}
                    {newCategoryCount > 0 ? (
                      <FilterChip
                        selected={isNewCategoryFilter(category)}
                        onClick={() => setPresetCategory(NEW_CATEGORY_FILTER)}
                      >
                        New <ChipCount value={newCategoryCount} />
                      </FilterChip>
                    ) : null}
                  </DragScroll>
                  <DragScroll role="group" aria-label="Storage filters">
                    <FilterChip
                      selected={sectionFilter === "all"}
                      onClick={() => setPresetSectionFilter("all")}
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
                          onClick={() => setPresetSectionFilter(id)}
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
                        onClick={() => setPresetLifeFilter("all")}
                      >
                        Any
                      </FilterChip>
                      {LIFE_KINDS.map((kind) => (
                        <FilterChip
                          key={kind}
                          selected={lifeFilter === kind}
                          onClick={() => setPresetLifeFilter(kind)}
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
                      onChange={(value) => setPresetCategory(value as string | "all")}
                      options={[
                        { value: "all", label: `All (${categoryTotal})` },
                        ...categories.map((item) => ({
                          value: item,
                          label: `${item} (${categoryCounts[item] ?? 0})`,
                        })),
                        ...(newCategoryCount > 0
                          ? [
                              {
                                value: NEW_CATEGORY_FILTER,
                                label: `New (${newCategoryCount})`,
                              },
                            ]
                          : []),
                      ]}
                    />
                    <FilterSelect
                      aria-label="Storage"
                      value={sectionFilter}
                      onChange={(value) => {
                        setPresetSectionFilter(value as SectionId | "all");
                      }}
                      options={[
                        {
                          value: "all",
                          label: `Any (${storageCounts.all})`,
                        },
                        ...FILTER_SECTIONS.flatMap((id) => {
                          const count = storageCounts.bySection[id] ?? 0;
                          if (count === 0) return [];
                          return [
                            {
                              value: id,
                              label: `${SECTION_TAG[id]} (${count})`,
                            },
                          ];
                        }),
                      ]}
                    />
                    {!compactList ? (
                      <FilterSelect
                        aria-label="Life date"
                        value={lifeFilter}
                        onChange={(value) => {
                          setPresetLifeFilter(value as LifeKind | "all");
                        }}
                        options={[
                          { value: "all", label: "Any" },
                          ...LIFE_KINDS.map((kind) => ({
                            value: kind,
                            label: LIFE_KIND_META[kind].filter,
                          })),
                        ]}
                      />
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
            onClick={() => setSettingsOpenSafe(true)}
            className="my-3 flex min-h-0 w-full flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-card/80 px-5 py-10 text-center active:bg-white/[0.06]"
          >
            <span className="font-display text-2xl text-white">No chart loaded</span>
            <span className="mt-2 block text-sm text-stone-400">
              Tap here to open settings and import a chart.
            </span>
          </button>
        ) : null}

        {hasChart && !itemOpen && query.trim() && hits.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-white/20 bg-card/80 px-5 py-8 text-center">
            <span className="font-display text-2xl text-white">Not on this chart</span>
            <span className="mt-2 block text-sm text-stone-400">
              Nothing matches “{query.trim()}”.
            </span>
          </p>
        ) : null}

        {activeVariant ? (
          <div className="mt-4 space-y-3" aria-live="polite">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {expandedVariants.length > 1 ? (
                  <DragScroll role="group" aria-label="Storage tags" className="gap-1.5">
                    {expandedVariants.map((variant) => {
                      const selected = variant.sectionId === activeVariant.sectionId;
                      return (
                        <button
                          key={variant.sectionId}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            if (expanded) {
                              setProductDefault(expanded, {
                                section: variant.sectionId,
                              });
                              setDetailLife(null);
                            }
                          }}
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
                          onClick={() => preferLife(kind)}
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
              </div>
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Back to list"
                title="Back"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3 text-xs font-semibold tracking-wide text-stone-200 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="size-3.5" strokeWidth={2.25} aria-hidden />
                Back
              </button>
            </div>
            <LifeCard
              key={`${activeVariant.rule.id}:${deliveryDate}:${prepTime}:${activeLife ?? "all"}`}
              rule={activeVariant.rule}
              pack={pack}
              deliveryDate={deliveryDate}
              prepTime={prepTime}
              focusKind={activeLife}
              variants={expandedVariants}
              kinds={expandedKinds}
              onPreferredSection={(sectionId) => {
                if (!expanded) return;
                setProductDefault(expanded, { section: sectionId });
                setDetailLife(null);
              }}
              onPreferredLife={preferLife}
              onHidden={clearSearch}
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
                const preview = pickVariant(variants, productDefaults[hit.name]?.section ?? null);
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
                          : rulesForName(hit.name, visibleRules)[0]?.prepped}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {hasChart && browsing ? (
          <ChartList
            pack={pack}
            category={category}
            deliveryDate={deliveryDate}
            prepTime={prepTime}
            today={today}
            sectionFilter={sectionFilter}
            lifeFilter={lifeFilter}
            sessionLife={sessionLife}
            productDefaults={productDefaults}
            onProductDefault={(name, section) => setProductDefault(name, { section })}
            onLifeFilter={setPresetLifeFilter}
            onLifePrefer={preferLife}
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

      {browsing && overlayButtonsReady ? (
        <button
          type="button"
          data-go-top=""
          aria-label={compactList ? "Show tags" : "Compact list without tags"}
          aria-pressed={compactList}
          onClick={() => setCompactList(!compactList)}
          className={cn(
            "absolute right-4 z-20 flex size-11 items-center justify-center rounded-full text-stone-950 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ring-1 backdrop-blur-sm transition-[background-color,opacity,box-shadow] duration-200",
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

      {overlayButtonsReady ? (
        <button
          type="button"
          data-go-top=""
          aria-label="Go to top"
          onClick={goToTop}
          className={cn(
            "absolute right-4 z-20 flex size-11 items-center justify-center rounded-full bg-white/40 text-stone-950 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ring-1 ring-white/20 backdrop-blur-sm transition-[background-color,opacity,box-shadow,transform] duration-200",
            "hover:bg-white hover:opacity-100 hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)] focus-visible:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:bg-white active:opacity-100",
            "bottom-[max(1rem,env(safe-area-inset-bottom))]",
            showGoTop
              ? "translate-y-0 opacity-45"
              : "pointer-events-none translate-y-3 opacity-0",
          )}
        >
          <ArrowUp className="size-5" strokeWidth={2.5} />
        </button>
      ) : null}

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4 transition-[opacity,transform] duration-300",
          "bottom-[max(1.25rem,env(safe-area-inset-bottom))]",
          dateError && overlayButtonsReady
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0",
        )}
        hidden={!overlayButtonsReady || !dateError}
      >
        <div className="flex max-w-sm items-start gap-2.5 rounded-2xl bg-red-600/55 px-4 py-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-red-200/35 backdrop-blur-md">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-red-50"
            strokeWidth={2.5}
            aria-hidden
          />
          <div className="min-w-0">
            {dateError === "far" ? (
              <>
                <p className="text-sm font-semibold text-white">
                  Wow — you&apos;re time travelling
                </p>
                <p className="mt-0.5 text-xs leading-snug text-red-50/90">
                  That date is more than {FAR_DATE_DAYS} days from today. Pick a
                  closer delivery/prep date.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">Future date</p>
                <p className="mt-0.5 text-xs leading-snug text-red-50/90">
                  Delivery/prep date can&apos;t be after today. Tap Today or pick
                  today or earlier.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {appUpdate.remoteVersion ? (
        <UpdateConfirmDialog
          open={updateConfirmOpen}
          onOpenChange={setUpdateConfirmOpen}
          localVersion={appUpdate.localVersion}
          remoteVersion={appUpdate.remoteVersion}
          notes={appUpdate.remoteNotes}
          busy={updatingApp}
          onConfirm={confirmAppUpdate}
        />
      ) : null}
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
  options,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
}) {
  return (
    <Select
      value={value}
      items={options}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-9 w-full min-w-0 rounded-xl border-white/10 bg-card px-2 text-xs font-medium text-white hover:bg-white/[0.06] focus-visible:border-white/25 focus-visible:ring-white/15 dark:bg-card dark:hover:bg-white/[0.06] [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-[8rem]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
