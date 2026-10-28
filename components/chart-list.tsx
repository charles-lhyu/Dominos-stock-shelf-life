"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { AutoScrollText } from "@/components/auto-scroll-text";
import { WhenDate } from "@/components/when-date";
import {
  categoriesInPack,
  calculatedLifeKind,
  datePreview,
  LIFE_KIND_META,
  LIFE_KINDS,
  lifeKindsForRule,
  pickLifeKind,
  pickVariant,
  sectionMatchesFilter,
  toppingGroup,
  uniqueNamesInCategory,
  variantsForName,
  type DatePreview,
  type ItemVariant,
  type LifeKind,
  type ToppingGroup,
} from "@/lib/preview";
import type { ProductDefault } from "@/lib/item-preset-store";
import {
  getHiddenNames,
  getHiddenNamesServer,
  subscribeHidden,
} from "@/lib/hidden-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChartPack, SectionId } from "@/lib/types";
import { cn } from "cn";

const TOPPING_GROUP_LABEL: Record<ToppingGroup, string> = {
  meats: "Meats",
  veg: "Veg",
  other: "Other",
};

type ListRow = {
  name: string;
  variants: ItemVariant[];
  active: ItemVariant;
  kinds: LifeKind[];
  activeLife: LifeKind | null;
  preview: DatePreview;
  hidden: boolean;
};

type StickyBlock = {
  key: string;
  category: string;
  label: string | null;
  rows: ListRow[];
};

/** Per-section list order: chart default, ascending, or descending. */
type DirSort = "off" | "asc" | "desc";

function sortRowsByDate(rows: ListRow[], sort: DirSort): ListRow[] {
  if (sort === "off") return rows;
  return [...rows].sort((a, b) => {
    const aTime = a.preview.at?.getTime();
    const bTime = b.preview.at?.getTime();
    // Rows without a calculated date stay at the end.
    if (aTime == null && bTime == null) return a.name.localeCompare(b.name);
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    if (aTime !== bTime) {
      return sort === "asc" ? aTime - bTime : bTime - aTime;
    }
    return a.name.localeCompare(b.name);
  });
}

function sortRowsByName(rows: ListRow[], sort: DirSort): ListRow[] {
  if (sort === "off") return rows;
  return [...rows].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    return sort === "asc" ? cmp : -cmp;
  });
}

function sortSectionRows(
  rows: ListRow[],
  nameSort: DirSort,
  dateSort: DirSort,
): ListRow[] {
  // Date sort wins when active; otherwise alphabetical.
  if (dateSort !== "off") return sortRowsByDate(rows, dateSort);
  if (nameSort !== "off") return sortRowsByName(rows, nameSort);
  return rows;
}

function nextDirSort(current: DirSort): DirSort {
  if (current === "off") return "asc";
  if (current === "asc") return "desc";
  return "off";
}

const SECTION_TONE: Record<SectionId, string> = {
  frozen: "bg-sky-500/25 text-sky-100 ring-sky-400/40",
  chilled: "bg-teal-500/25 text-teal-100 ring-teal-400/40",
  ready: "bg-amber-500/25 text-amber-100 ring-amber-400/40",
  ambient: "bg-orange-500/25 text-orange-100 ring-orange-400/40",
  pack: "bg-stone-500/30 text-stone-100 ring-stone-400/40",
};

const SECTION_ACTIVE: Record<SectionId, string> = {
  // dark:bg-* beats SelectTrigger’s dark:bg-input/30 so chip fills stay solid.
  frozen:
    "bg-sky-400 text-sky-950 ring-sky-300 dark:bg-sky-400 dark:text-sky-950 dark:hover:bg-sky-300",
  chilled:
    "bg-teal-400 text-teal-950 ring-teal-300 dark:bg-teal-400 dark:text-teal-950 dark:hover:bg-teal-300",
  ready:
    "bg-amber-400 text-amber-950 ring-amber-300 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300",
  ambient:
    "bg-orange-400 text-orange-950 ring-orange-300 dark:bg-orange-400 dark:text-orange-950 dark:hover:bg-orange-300",
  pack:
    "bg-stone-200 text-stone-950 ring-stone-100 dark:bg-stone-200 dark:text-stone-950 dark:hover:bg-stone-100",
};

const LIFE_ACTIVE: Record<LifeKind, string> = {
  stock: "bg-violet-300 text-violet-950 ring-violet-200",
  prepped: "bg-fuchsia-300 text-fuchsia-950 ring-fuchsia-200",
  ambient: "bg-rose-300 text-rose-950 ring-rose-200",
};

function scrollSectionToTop(section: HTMLElement) {
  const scroller = section.closest("main");
  if (!(scroller instanceof HTMLElement)) return;
  // Aim the first row just under the sticky category header so the header
  // doesn't cover it (flush section-top scroll sits the row too high).
  const header = section.querySelector<HTMLElement>("[data-section-header]");
  const firstRow =
    section.querySelector<HTMLElement>(":scope > ul > li") ??
    section.querySelector<HTMLElement>("ul li");
  // Include sticky `top` offset (e.g. Toppings subgroups sit under the title).
  const stickTop = header ? Number.parseFloat(getComputedStyle(header).top) || 0 : 0;
  const headerH = (header?.offsetHeight ?? 0) + stickTop;
  const anchor = firstRow ?? section;
  const top =
    anchor.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop -
    (firstRow ? headerH : 0);
  scroller.scrollTop = Math.max(0, top);
}

function sectionRootFromEvent(event: { currentTarget: EventTarget | null }) {
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement)) return null;
  const root = el.closest("[data-section-root]");
  return root instanceof HTMLElement ? root : null;
}

export function ChartList({
  pack,
  category,
  deliveryDate,
  prepTime = "",
  today,
  sectionFilter,
  lifeFilter,
  productDefaults,
  onProductDefault,
  onLifeFilter,
  onOpen,
  compact = false,
}: {
  pack: ChartPack;
  category: string | "all";
  deliveryDate: string;
  prepTime?: string;
  today: Date | null;
  sectionFilter: SectionId | "all";
  lifeFilter: LifeKind | "all";
  productDefaults: Record<string, ProductDefault>;
  onProductDefault: (name: string, section: SectionId, life: LifeKind | null) => void;
  onLifeFilter: (kind: LifeKind) => void;
  onOpen: (name: string, sectionId: SectionId) => void;
  compact?: boolean;
}) {
  const [nameSort, setNameSort] = useState<DirSort>("off");
  const [dateSort, setDateSort] = useState<DirSort>("off");
  const [showHidden, setShowHidden] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hiddenNames = useSyncExternalStore(
    subscribeHidden,
    getHiddenNames,
    getHiddenNamesServer,
  );
  const hidden = new Set(hiddenNames);
  const hiddenCount = hiddenNames.length;
  const categories = category === "all" ? categoriesInPack(pack) : [category];
  const blocks: StickyBlock[] = [];

  for (const cat of categories) {
    const names = uniqueNamesInCategory(pack.rules, cat).filter(
      (name) => showHidden || !hidden.has(name),
    );
    const rows: ListRow[] = names.flatMap((name) => {
      let variants = variantsForName(name, pack.rules, pack).filter(
        (item) => item.rule.category === cat,
      );
      if (sectionFilter !== "all") {
        variants = variants.filter((item) =>
          sectionMatchesFilter(item.sectionId, sectionFilter),
        );
      }
      if (lifeFilter !== "all") {
        variants = variants.filter((item) => lifeKindsForRule(item.rule).includes(lifeFilter));
      }
      if (variants.length === 0) return [];

      const saved = productDefaults[name];
      const sectionPreference =
        sectionFilter !== "all" ? sectionFilter : (saved?.section ?? null);
      const active = pickVariant(variants, sectionPreference);
      if (!active) return [];

      const kinds = lifeKindsForRule(active.rule);
      const lifePreference = lifeFilter !== "all" ? lifeFilter : (saved?.life ?? null);
      const activeLife = pickLifeKind(
        kinds,
        lifePreference ?? calculatedLifeKind(active.rule),
      );
      const preview = datePreview(active.rule, deliveryDate, activeLife, today, prepTime);

      return [{ name, variants, active, kinds, activeLife, preview, hidden: hidden.has(name) }];
    });

    if (rows.length === 0) continue;

    if (cat === "Toppings") {
      for (const row of rows) {
        const group = toppingGroup(row.name);
        const key = `${cat}:${group}`;
        const last = blocks[blocks.length - 1];
        if (!last || last.key !== key) {
          blocks.push({
            key,
            category: cat,
            label: TOPPING_GROUP_LABEL[group],
            rows: [row],
          });
        } else {
          last.rows.push(row);
        }
      }
    } else {
      blocks.push({ key: cat, category: cat, label: null, rows });
    }
  }

  const activeLife: LifeKind = lifeFilter === "all" ? "stock" : lifeFilter;
  const showHiddenControl = hiddenCount > 0 || showHidden;

  const actions: ListActions = {
    onOpen,
    onProductDefault,
    compact,
    showHiddenChip: compact && showHiddenControl,
    nameSort,
    dateSort,
    onToggleNameSort: () => {
      setNameSort((prev) => nextDirSort(prev));
      setDateSort("off");
    },
    onToggleDateSort: () => {
      setDateSort((prev) => nextDirSort(prev));
      setNameSort("off");
    },
  };

  return (
    <div ref={listRef} className="relative select-none">
      <SortButtonOverlay
        nameSort={nameSort}
        dateSort={dateSort}
        showHidden={showHidden}
        showHiddenControl={!compact && showHiddenControl}
        hiddenCount={hiddenCount}
        onToggleShowHidden={() => setShowHidden((on) => !on)}
        onToggleNameSort={() => {
          setNameSort((prev) => nextDirSort(prev));
          setDateSort("off");
        }}
        onToggleDateSort={() => {
          setDateSort((prev) => nextDirSort(prev));
          setNameSort("off");
        }}
      />
      {compact ? (
        <div className="sticky top-0 z-50 -mx-4 h-0 w-[calc(100%+2rem)] overflow-visible">
          <div
            className="absolute top-3.5 right-4 flex flex-nowrap items-center gap-1"
            role="group"
            aria-label="Life date filter"
          >
            {showHiddenControl ? (
              <ShowHiddenButton
                showHidden={showHidden}
                hiddenCount={hiddenCount}
                onToggle={() => setShowHidden((on) => !on)}
                compact
              />
            ) : null}
            {LIFE_KINDS.map((kind) => {
              const selected = activeLife === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onLifeFilter(kind)}
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[0.625rem] font-semibold tracking-wide ring-1",
                    selected
                      ? LIFE_ACTIVE[kind]
                      : "bg-card text-stone-300 ring-white/15",
                  )}
                >
                  {LIFE_KIND_META[kind].tag}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {/*
        Nested sections: each sticky parent wraps everything after it, so the
        header stays put while the next header (higher z-index) slides over it.
        Compact: life chips overlay the title only; sort row stays full width
        so date sort lines up with the use-by column.
      */}
      {renderCoverStack(blocks, 0, actions)}
    </div>
  );
}

type ListActions = {
  onOpen: (name: string, sectionId: SectionId) => void;
  onProductDefault: (name: string, section: SectionId, life: LifeKind | null) => void;
  compact: boolean;
  showHiddenChip: boolean;
  nameSort: DirSort;
  dateSort: DirSort;
  onToggleNameSort: () => void;
  onToggleDateSort: () => void;
};

/** Title line plus the gap before the sort row, matching the sticky category header. */
const SORT_ROW_TOP = "top-[calc(0.75rem+1.125rem*1.25+0.25rem)]";

/**
 * Sort controls stay fixed over the category header. Incoming category
 * titles slide underneath them instead of covering the buttons.
 */
function SortButtonOverlay({
  nameSort,
  dateSort,
  showHidden,
  showHiddenControl,
  hiddenCount,
  onToggleShowHidden,
  onToggleNameSort,
  onToggleDateSort,
}: {
  nameSort: DirSort;
  dateSort: DirSort;
  showHidden: boolean;
  showHiddenControl: boolean;
  hiddenCount: number;
  onToggleShowHidden: () => void;
  onToggleNameSort: () => void;
  onToggleDateSort: () => void;
}) {
  return (
    <div
      data-sort-overlay=""
      className="pointer-events-none sticky top-0 z-40 h-0"
    >
      <div
        className={cn(
          "pointer-events-auto absolute right-0 left-0 flex min-h-8 items-center gap-1.5",
          SORT_ROW_TOP,
        )}
      >
        <NameSortButton sort={nameSort} onToggle={onToggleNameSort} />
        <div className="min-w-0 flex-1" />
        <div className="relative flex w-[46%] shrink-0 justify-end">
          {showHiddenControl ? (
            <div className="absolute right-0 bottom-full mb-1">
              <ShowHiddenButton
                showHidden={showHidden}
                hiddenCount={hiddenCount}
                onToggle={onToggleShowHidden}
              />
            </div>
          ) : null}
          <DateSortButton sort={dateSort} onToggle={onToggleDateSort} />
        </div>
      </div>
    </div>
  );
}

function ShowHiddenButton({
  showHidden,
  hiddenCount,
  onToggle,
  compact = false,
}: {
  showHidden: boolean;
  hiddenCount: number;
  onToggle: () => void;
  compact?: boolean;
}) {
  const countLabel = hiddenCount > 0 ? ` (${hiddenCount})` : "";
  const label = showHidden
    ? `Showing hidden${countLabel}`
    : `Show hidden${countLabel}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={showHidden}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative isolate inline-flex shrink-0 items-center gap-1 font-semibold tracking-wide ring-1 transition-colors before:absolute before:inset-0 before:-z-10 before:rounded-md before:bg-[#0f1624]",
        compact
          ? "h-6 rounded-md px-1.5 text-[0.625rem]"
          : "h-6 rounded-md px-1.5 text-[0.6875rem]",
        showHidden
          ? "bg-amber-400/20 text-amber-100 ring-amber-400/40 hover:bg-amber-400/30"
          : "text-stone-300 ring-white/15 hover:bg-white/10 hover:text-white",
      )}
    >
      {showHidden ? (
        <Eye className="size-3" strokeWidth={2.25} aria-hidden />
      ) : (
        <EyeOff className="size-3" strokeWidth={2.25} aria-hidden />
      )}
      <span className="max-w-[6.5rem] truncate">
        {showHidden ? "Hidden" : "Show hidden"}
        {hiddenCount > 0 ? ` (${hiddenCount})` : ""}
      </span>
    </button>
  );
}

/** Sub-header row: keeps the sort-row height while category titles slide past.
 *  The buttons themselves live in SortButtonOverlay so they stay on top.
 */
function SubHeaderSortRow({
  label,
  nameSort,
  dateSort,
  onToggleNameSort,
  onToggleDateSort,
  showSort,
  labelClassName,
}: {
  label: ReactNode;
  nameSort: DirSort;
  dateSort: DirSort;
  onToggleNameSort: () => void;
  onToggleDateSort: () => void;
  showSort: boolean;
  labelClassName?: string;
}) {
  return (
    <div
      className="mt-1 flex min-h-8 w-full items-center gap-1.5"
      role={showSort ? "group" : undefined}
      aria-label={showSort ? "List sort" : undefined}
    >
      {showSort ? (
        <NameSortButton sort={nameSort} onToggle={onToggleNameSort} />
      ) : (
        <div className="size-8 shrink-0" aria-hidden />
      )}
      <div className={cn("min-w-0 flex-1", labelClassName)}>{label}</div>
      {/* Same column edge as list use-by dates (far right). */}
      <div className="flex w-[46%] shrink-0 justify-end">
        {showSort ? (
          <DateSortButton sort={dateSort} onToggle={onToggleDateSort} />
        ) : (
          <div className="size-8" aria-hidden />
        )}
      </div>
    </div>
  );
}

function NameSortButton({
  sort,
  onToggle,
}: {
  sort: DirSort;
  onToggle: () => void;
}) {
  const label =
    sort === "asc"
      ? "Sorted A to Z. Tap for Z to A."
      : sort === "desc"
        ? "Sorted Z to A. Tap for chart order."
        : "Sort A to Z";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={sort !== "off"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative isolate inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-[#0f1624]",
        sort === "off"
          ? "text-stone-400 ring-white/15 hover:bg-white/10 hover:text-white"
          : "bg-sky-400/20 text-sky-100 ring-sky-400/40 hover:bg-sky-400/30",
      )}
    >
      {sort === "desc" ? (
        <ArrowUpAZ className="size-3.5" strokeWidth={2.25} aria-hidden />
      ) : (
        <ArrowDownAZ className="size-3.5" strokeWidth={2.25} aria-hidden />
      )}
    </button>
  );
}

function DateSortButton({
  sort,
  onToggle,
}: {
  sort: DirSort;
  onToggle: () => void;
}) {
  const label =
    sort === "asc"
      ? "Sorted by date, soonest first. Tap for latest first."
      : sort === "desc"
        ? "Sorted by date, latest first. Tap for chart order."
        : "Sort by use-by date";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={sort !== "off"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative isolate inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-[#0f1624]",
        sort === "off"
          ? "text-stone-400 ring-white/15 hover:bg-white/10 hover:text-white"
          : "bg-amber-400/20 text-amber-100 ring-amber-400/40 hover:bg-amber-400/30",
      )}
    >
      {sort === "desc" ? (
        <ArrowUpWideNarrow className="size-3.5" strokeWidth={2.25} aria-hidden />
      ) : (
        <ArrowDownWideNarrow className="size-3.5" strokeWidth={2.25} aria-hidden />
      )}
    </button>
  );
}

function renderCoverStack(
  blocks: StickyBlock[],
  index: number,
  actions: ListActions,
): ReactNode {
  const block = blocks[index];
  if (!block) return null;

  // Consecutive Toppings subgroups share one sticky header; the sub-row
  // (sorts + Meats/Veg/Other) stays fixed — only the label text updates.
  if (block.category === "Toppings" && block.label) {
    let end = index;
    while (
      end < blocks.length &&
      blocks[end]?.category === "Toppings" &&
      blocks[end]?.label
    ) {
      end += 1;
    }
    const groups = blocks.slice(index, end);
    return (
      <ToppingsSection
        key="toppings"
        groups={groups}
        actions={actions}
        zIndex={10 + index}
        after={renderCoverStack(blocks, end, actions)}
      />
    );
  }

  const rows = sortSectionRows(block.rows, actions.nameSort, actions.dateSort);
  const sortKey = block.key;

  return (
    <div key={block.key} data-section-root="">
      <div
        data-section-header=""
        data-sort-key={sortKey}
        className="sticky top-0 -mx-4 w-[calc(100%+2rem)] overflow-visible border-b border-white/10 bg-[#0f1624] px-4 pt-3 pb-1.5"
        style={{ zIndex: 10 + index }}
      >
        <button
          type="button"
          aria-label={`Go to ${block.category}`}
          onClick={(event) => {
            const section = sectionRootFromEvent(event);
            if (section) scrollSectionToTop(section);
          }}
          className={cn(
            "w-full min-w-0 text-left",
            // Leave room for the compact life-chip overlay on the title only.
            actions.compact &&
              (actions.showHiddenChip ? "pr-[18rem]" : "pr-[11.5rem]"),
          )}
        >
          <h2 className="font-display truncate text-lg leading-tight font-bold text-white">
            {block.category}
          </h2>
        </button>
        <SubHeaderSortRow
          label={<span className="sr-only">Sort {block.category}</span>}
          nameSort={actions.nameSort}
          dateSort={actions.dateSort}
          onToggleNameSort={actions.onToggleNameSort}
          onToggleDateSort={actions.onToggleDateSort}
          showSort={false}
        />
      </div>
      <ul className="divide-y divide-white/10">
        {rows.map((row) => (
          <ProductRow
            key={`${block.key}:${row.name}`}
            row={row}
            compact={actions.compact}
            onOpen={actions.onOpen}
            onProductDefault={actions.onProductDefault}
          />
        ))}
      </ul>
      {renderCoverStack(blocks, index + 1, actions)}
    </div>
  );
}

function ToppingsSection({
  groups,
  actions,
  zIndex,
  after,
}: {
  groups: StickyBlock[];
  actions: ListActions;
  zIndex: number;
  after: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const groupKey = groups.map((group) => group.label ?? group.key).join("|");
  const [activeLabel, setActiveLabel] = useState(groups[0]?.label ?? "Meats");

  const firstLabel = groups[0]?.label ?? "Meats";
  useEffect(() => {
    setActiveLabel(firstLabel);
  }, [firstLabel]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = root.closest("main");
    if (!(scroller instanceof HTMLElement)) return;
    const markers = [
      ...root.querySelectorAll<HTMLElement>("[data-topping-group]"),
    ];
    if (markers.length === 0) return;

    const header = root.querySelector<HTMLElement>("[data-section-header]");
    const headerH = header?.offsetHeight ?? 56;

    const pickLabel = () => {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const line = scrollerTop + headerH + 8;
      let current = markers[0]?.dataset.toppingGroup ?? "Meats";
      for (const marker of markers) {
        const top = marker.getBoundingClientRect().top;
        if (top <= line) {
          current = marker.dataset.toppingGroup ?? current;
        } else {
          break;
        }
      }
      setActiveLabel(current);
    };

    pickLabel();
    scroller.addEventListener("scroll", pickLabel, { passive: true });
    return () => scroller.removeEventListener("scroll", pickLabel);
  }, [groupKey]);

  return (
    <div ref={rootRef} data-section-root="">
      <div
        data-section-header=""
        data-sort-key="toppings"
        className="sticky top-0 -mx-4 w-[calc(100%+2rem)] overflow-visible border-b border-white/10 bg-[#0f1624] px-4 pt-3 pb-1.5"
        style={{ zIndex }}
      >
        <button
          type="button"
          aria-label="Go to Toppings"
          onClick={(event) => {
            const section = sectionRootFromEvent(event);
            if (section) scrollSectionToTop(section);
          }}
          className={cn(
            "w-full min-w-0 text-left",
            // Leave room for the compact life-chip overlay on the title only.
            actions.compact &&
              (actions.showHiddenChip ? "pr-[18rem]" : "pr-[11.5rem]"),
          )}
        >
          <h2 className="font-display truncate text-lg leading-tight font-bold text-white">
            Toppings
          </h2>
        </button>
        <SubHeaderSortRow
          label={
            <p className="text-[0.6875rem] leading-5 font-semibold uppercase tracking-wider text-stone-400">
              {activeLabel}
            </p>
          }
          nameSort={actions.nameSort}
          dateSort={actions.dateSort}
          onToggleNameSort={actions.onToggleNameSort}
          onToggleDateSort={actions.onToggleDateSort}
          showSort={false}
        />
      </div>
      {groups.map((group, groupIndex) => {
        const rows = sortSectionRows(group.rows, actions.nameSort, actions.dateSort);
        return (
          <div
            key={group.key}
            data-topping-group={group.label ?? undefined}
            data-section-root=""
          >
            {/* In-list separators scroll with the list. Skip the first — sticky
                subheader already shows that label at the top. */}
            {groupIndex > 0 ? (
              <p className="border-b border-white/10 px-0.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-stone-500">
                {group.label}
              </p>
            ) : null}
            <ul className="divide-y divide-white/10">
              {rows.map((row) => (
                <ProductRow
                  key={`${group.key}:${row.name}`}
                  row={row}
                  compact={actions.compact}
                  onOpen={actions.onOpen}
                  onProductDefault={actions.onProductDefault}
                />
              ))}
            </ul>
          </div>
        );
      })}
      {after}
    </div>
  );
}

function ProductRow({
  row,
  compact,
  onOpen,
  onProductDefault,
}: {
  row: ListRow;
  compact: boolean;
  onOpen: (name: string, sectionId: SectionId) => void;
  onProductDefault: (name: string, section: SectionId, life: LifeKind | null) => void;
}) {
  const { name, variants, active, kinds, activeLife, preview, hidden } = row;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-label={hidden ? `Open ${name} (hidden)` : `Open ${name}`}
        className={cn(
          "touch-pan-y rounded-xl transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]",
          compact ? "min-h-11 py-2" : "min-h-14 py-2.5",
          hidden && "opacity-70",
        )}
        onClick={() => onOpen(name, active.sectionId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(name, active.sectionId);
          }
        }}
      >
        <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {hidden ? (
              <EyeOff
                className="size-3.5 shrink-0 text-stone-500"
                strokeWidth={2.25}
                aria-hidden
              />
            ) : null}
            <AutoScrollText className="w-0 min-w-0 flex-1 font-medium text-white">
              {name}
            </AutoScrollText>
            {compact ? (
              <CompactStorageTag
                variants={variants}
                active={active}
                onPreferredSection={(sectionId) => onProductDefault(name, sectionId, activeLife)}
              />
            ) : null}
          </div>
          <WhenDate
            when={preview.when}
            at={preview.at}
            asHours={preview.asHours}
            className={cn(
              "max-w-[46%] shrink truncate touch-pan-y text-right text-sm leading-snug",
              preview.tone === "neutral" ? "text-stone-400" : "text-emerald-300",
            )}
          />
        </div>
        {!compact ? (
          <div
            className="mt-1.5 flex min-h-8 flex-wrap content-start gap-1"
            role="group"
            aria-label={`${name} tags`}
          >
            {variants.map((variant) => {
              const selected = variant.sectionId === active.sectionId;
              return (
                <button
                  key={variant.sectionId}
                  type="button"
                  aria-pressed={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onProductDefault(name, variant.sectionId, activeLife);
                  }}
                  className={cn(
                    "touch-pan-y shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide ring-1",
                    selected
                      ? SECTION_ACTIVE[variant.sectionId]
                      : SECTION_TONE[variant.sectionId],
                  )}
                >
                  {variant.tag}
                </button>
              );
            })}
            {activeLife ? (
              kinds.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Life: ${LIFE_KIND_META[activeLife].tag}. Tap to cycle.`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const kindIndex = kinds.indexOf(activeLife);
                    const next = kinds[(kindIndex + 1) % kinds.length]!;
                    onProductDefault(name, active.sectionId, next);
                  }}
                  className={cn(
                    "inline-flex touch-pan-y shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide ring-1",
                    LIFE_ACTIVE[activeLife],
                  )}
                >
                  {LIFE_KIND_META[activeLife].tag}
                  <ChevronDown className="size-3 opacity-80" aria-hidden />
                </button>
              ) : (
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide ring-1",
                    LIFE_ACTIVE[activeLife],
                  )}
                >
                  {LIFE_KIND_META[activeLife].tag}
                </span>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function CompactStorageTag({
  variants,
  active,
  onPreferredSection,
}: {
  variants: ItemVariant[];
  active: ItemVariant;
  onPreferredSection: (section: SectionId) => void;
}) {
  const tone = SECTION_ACTIVE[active.sectionId];

  if (variants.length <= 1) {
    return (
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide ring-1",
          tone,
        )}
      >
        {active.tag}
      </span>
    );
  }

  return (
    <div
      className="relative inline-flex h-6 shrink-0 items-center"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Select
        value={active.sectionId}
        items={variants.map((variant) => ({
          value: variant.sectionId,
          label: variant.tag,
        }))}
        onValueChange={(value) => {
          if (typeof value === "string") {
            onPreferredSection(value as SectionId);
          }
        }}
      >
        <SelectTrigger
          aria-label="Storage"
          size="sm"
          className={cn(
            "h-6 max-w-[7.5rem] gap-0.5 rounded-md border-0 px-1.5 py-0 text-[0.6875rem] font-semibold uppercase tracking-wide shadow-none ring-1 focus-visible:ring-2 focus-visible:ring-white/30 data-[size=sm]:h-6 dark:border-0 [&_svg]:size-3 [&_svg]:text-current [&_svg]:opacity-80 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate",
            tone,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[7rem]">
          {variants.map((variant) => (
            <SelectItem
              key={variant.sectionId}
              value={variant.sectionId}
              className="text-[0.6875rem] font-semibold uppercase tracking-wide"
            >
              {variant.tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

