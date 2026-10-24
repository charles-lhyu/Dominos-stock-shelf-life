"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  ChevronDown,
} from "lucide-react";
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
import {
  getHiddenNames,
  getHiddenNamesServer,
  subscribeHidden,
} from "@/lib/hidden-store";
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
  frozen: "bg-sky-400 text-sky-950 ring-sky-300",
  chilled: "bg-teal-400 text-teal-950 ring-teal-300",
  ready: "bg-amber-400 text-amber-950 ring-amber-300",
  ambient: "bg-orange-400 text-orange-950 ring-orange-300",
  pack: "bg-stone-200 text-stone-950 ring-stone-100",
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
  preferredSection,
  preferredLife,
  onPreferredSection,
  onPreferredLife,
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
  preferredSection: SectionId | null;
  preferredLife: LifeKind | null;
  onPreferredSection: (section: SectionId) => void;
  onPreferredLife: (kind: LifeKind) => void;
  onLifeFilter: (kind: LifeKind) => void;
  onOpen: (name: string, sectionId: SectionId) => void;
  compact?: boolean;
}) {
  const [nameSortByKey, setNameSortByKey] = useState<Record<string, DirSort>>({});
  const [dateSortByKey, setDateSortByKey] = useState<Record<string, DirSort>>({});
  const hiddenNames = useSyncExternalStore(
    subscribeHidden,
    getHiddenNames,
    getHiddenNamesServer,
  );
  const hidden = new Set(hiddenNames);
  const categories = category === "all" ? categoriesInPack(pack) : [category];
  const blocks: StickyBlock[] = [];

  for (const cat of categories) {
    const names = uniqueNamesInCategory(pack.rules, cat).filter((name) => !hidden.has(name));
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

      const sectionPreference = sectionFilter !== "all" ? sectionFilter : preferredSection;
      const active = pickVariant(variants, sectionPreference);
      if (!active) return [];

      const kinds = lifeKindsForRule(active.rule);
      const lifePreference = lifeFilter !== "all" ? lifeFilter : preferredLife;
      const activeLife = pickLifeKind(
        kinds,
        lifePreference ?? calculatedLifeKind(active.rule),
      );
      const preview = datePreview(active.rule, deliveryDate, activeLife, today, prepTime);

      return [{ name, variants, active, kinds, activeLife, preview }];
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

  const actions: ListActions = {
    onOpen,
    onPreferredSection,
    onPreferredLife,
    compact,
    nameSortByKey,
    dateSortByKey,
    onToggleNameSort: (key) => {
      setNameSortByKey((prev) => ({
        ...prev,
        [key]: nextDirSort(prev[key] ?? "off"),
      }));
      // Prefer one active sort mode at a time.
      setDateSortByKey((prev) => ({ ...prev, [key]: "off" }));
    },
    onToggleDateSort: (key) => {
      setDateSortByKey((prev) => ({
        ...prev,
        [key]: nextDirSort(prev[key] ?? "off"),
      }));
      setNameSortByKey((prev) => ({ ...prev, [key]: "off" }));
    },
  };
  const activeLife: LifeKind = lifeFilter === "all" ? "stock" : lifeFilter;

  return (
    <div className="relative select-none">
      {compact ? (
        <div className="sticky top-0 z-50 -mx-4 h-0 w-[calc(100%+2rem)] overflow-visible">
          <div
            className="absolute top-1.5 right-4 flex flex-nowrap items-center gap-1"
            role="group"
            aria-label="Life date filter"
          >
            {LIFE_KINDS.map((kind) => {
              const selected = activeLife === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onLifeFilter(kind)}
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold tracking-wide ring-1",
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
        Life tags sit in a single overlay on the topmost sticky header row.
      */}
      {renderCoverStack(blocks, 0, actions)}
    </div>
  );
}

type ListActions = {
  onOpen: (name: string, sectionId: SectionId) => void;
  onPreferredSection: (section: SectionId) => void;
  onPreferredLife: (kind: LifeKind) => void;
  compact: boolean;
  nameSortByKey: Record<string, DirSort>;
  dateSortByKey: Record<string, DirSort>;
  onToggleNameSort: (key: string) => void;
  onToggleDateSort: (key: string) => void;
};

function CategoryNameSortButton({
  sortKey,
  sort,
  onToggle,
}: {
  sortKey: string;
  sort: DirSort;
  onToggle: (key: string) => void;
}) {
  const label =
    sort === "asc"
      ? "Sorted A to Z. Tap for Z to A."
      : sort === "desc"
        ? "Sorted Z to A. Tap for chart order."
        : "Sort this section A to Z";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={sort !== "off"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(sortKey);
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
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

function CategoryDateSortButton({
  sortKey,
  sort,
  onToggle,
}: {
  sortKey: string;
  sort: DirSort;
  onToggle: (key: string) => void;
}) {
  const label =
    sort === "asc"
      ? "Sorted by date, soonest first. Tap for latest first."
      : sort === "desc"
        ? "Sorted by date, latest first. Tap for chart order."
        : "Sort this section by use-by date";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={sort !== "off"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(sortKey);
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
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

/**
 * Toppings sticky title row only (pt-1 + text-lg). Subgroup labels stick at this
 * offset so they sit in the reserved merge slot under the title.
 */
const TOPPINGS_TITLE_TOP = "1.75rem";
/** mt-1 + 11px/leading-5 label + pb-1.5 — matches the reserved slot under Toppings. */
const TOPPINGS_SUB_SLOT = "2.125rem";

function renderCoverStack(
  blocks: StickyBlock[],
  index: number,
  actions: ListActions,
): ReactNode {
  const block = blocks[index];
  if (!block) return null;

  // Consecutive Toppings subgroups share one sticky “Toppings” title with a
  // reserved sub-slot; Meats / Veg / Other merge into that slot when stuck.
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
    const zBase = 10 + index;

    const toppingsNameSort = actions.nameSortByKey.Toppings ?? "off";
    const toppingsDateSort = actions.dateSortByKey.Toppings ?? "off";

    return (
      <div key="toppings" data-section-root="">
        <div
          data-section-header=""
          className={cn(
            "sticky top-0 -mx-4 flex w-[calc(100%+2rem)] items-start gap-2 border-b border-white/10 bg-[#0f1624] px-4 pt-1 pb-1.5",
            actions.compact && "pr-[11.5rem]",
          )}
          style={{ zIndex: zBase }}
        >
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            <button
              type="button"
              aria-label="Go to Toppings"
              onClick={(event) => {
                const section = sectionRootFromEvent(event);
                if (section) scrollSectionToTop(section);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <h2 className="font-display text-lg leading-tight text-white">Toppings</h2>
              {/* Invisible slot — subgroup stickies overlay this when merged. */}
            <p
              className="mt-1 h-5 text-[11px] leading-5 font-semibold uppercase tracking-wider invisible"
              aria-hidden
            >
              Meats
            </p>
            </button>
            <CategoryNameSortButton
              sortKey="Toppings"
              sort={toppingsNameSort}
              onToggle={actions.onToggleNameSort}
            />
          </div>
          <div className="flex max-w-[46%] shrink-0 justify-end pt-0.5">
            <CategoryDateSortButton
              sortKey="Toppings"
              sort={toppingsDateSort}
              onToggle={actions.onToggleDateSort}
            />
          </div>
        </div>
        {renderToppingGroupStack(groups, 0, actions, zBase)}
        {renderCoverStack(blocks, end, actions)}
      </div>
    );
  }

  const nameSort = actions.nameSortByKey[block.key] ?? "off";
  const dateSort = actions.dateSortByKey[block.key] ?? "off";
  const rows = sortSectionRows(block.rows, nameSort, dateSort);

  return (
    <div key={block.key} data-section-root="">
      <div
        data-section-header=""
        className={cn(
          "sticky top-0 -mx-4 flex w-[calc(100%+2rem)] items-center gap-2 border-b border-white/10 bg-[#0f1624] px-4 pt-1 pb-1.5",
          actions.compact && "pr-[11.5rem]",
        )}
        style={{ zIndex: 10 + index }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            aria-label={`Go to ${block.category}`}
            onClick={(event) => {
              const section = sectionRootFromEvent(event);
              if (section) scrollSectionToTop(section);
            }}
            className="min-w-0 flex-1 text-left"
          >
            <h2 className="font-display text-lg leading-tight text-white">
              {block.category}
            </h2>
          </button>
          <CategoryNameSortButton
            sortKey={block.key}
            sort={nameSort}
            onToggle={actions.onToggleNameSort}
          />
        </div>
        <div className="flex max-w-[46%] shrink-0 justify-end">
          <CategoryDateSortButton
            sortKey={block.key}
            sort={dateSort}
            onToggle={actions.onToggleDateSort}
          />
        </div>
      </div>
      <ul className="divide-y divide-white/10">
        {rows.map((row) => (
          <ProductRow
            key={`${block.key}:${row.name}`}
            row={row}
            compact={actions.compact}
            onOpen={actions.onOpen}
            onPreferredSection={actions.onPreferredSection}
            onPreferredLife={actions.onPreferredLife}
          />
        ))}
      </ul>
      {renderCoverStack(blocks, index + 1, actions)}
    </div>
  );
}

function renderToppingGroupStack(
  groups: StickyBlock[],
  index: number,
  actions: ListActions,
  zBase: number,
): ReactNode {
  const group = groups[index];
  if (!group) return null;

  const nameSort = actions.nameSortByKey.Toppings ?? "off";
  const dateSort = actions.dateSortByKey.Toppings ?? "off";
  const rows = sortSectionRows(group.rows, nameSort, dateSort);

  return (
    <div key={group.key} data-section-root="">
      <button
        type="button"
        data-section-header=""
        aria-label={`Go to Toppings, ${group.label}`}
        onClick={(event) => {
          const section = sectionRootFromEvent(event);
          if (section) scrollSectionToTop(section);
        }}
        className="sticky -mx-4 block w-[calc(100%+2rem)] border-b border-white/10 bg-[#0f1624] px-4 pb-1.5 text-left"
        style={{
          top: TOPPINGS_TITLE_TOP,
          zIndex: zBase + 1 + index,
          // First group pulls up into the reserved slot so the list isn’t doubled.
          ...(index === 0 ? { marginTop: `calc(-1 * ${TOPPINGS_SUB_SLOT})` } : {}),
        }}
      >
        <p className="mt-1 h-5 text-[11px] leading-5 font-semibold uppercase tracking-wider text-stone-400">
          {group.label}
        </p>
      </button>
      <ul className="divide-y divide-white/10">
        {rows.map((row) => (
          <ProductRow
            key={`${group.key}:${row.name}`}
            row={row}
            compact={actions.compact}
            onOpen={actions.onOpen}
            onPreferredSection={actions.onPreferredSection}
            onPreferredLife={actions.onPreferredLife}
          />
        ))}
      </ul>
      {renderToppingGroupStack(groups, index + 1, actions, zBase)}
    </div>
  );
}

function ProductRow({
  row,
  compact,
  onOpen,
  onPreferredSection,
  onPreferredLife,
}: {
  row: ListRow;
  compact: boolean;
  onOpen: (name: string, sectionId: SectionId) => void;
  onPreferredSection: (section: SectionId) => void;
  onPreferredLife: (kind: LifeKind) => void;
}) {
  const { name, variants, active, kinds, activeLife, preview } = row;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${name}`}
        className={cn(
          "touch-pan-y rounded-xl transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]",
          compact ? "min-h-11 py-2" : "min-h-14 py-2.5",
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
            <span className="min-w-0 truncate font-medium text-white">{name}</span>
            {compact ? (
              <CompactStorageTag
                variants={variants}
                active={active}
                onPreferredSection={onPreferredSection}
              />
            ) : null}
          </div>
          <WhenDate
            when={preview.when}
            at={preview.at}
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
                    onPreferredSection(variant.sectionId);
                  }}
                  className={cn(
                    "touch-pan-y shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1",
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
                    onPreferredLife(next);
                  }}
                  className={cn(
                    "inline-flex touch-pan-y shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1",
                    LIFE_ACTIVE[activeLife],
                  )}
                >
                  {LIFE_KIND_META[activeLife].tag}
                  <ChevronDown className="size-3 opacity-80" aria-hidden />
                </button>
              ) : (
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1",
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
          "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1",
          tone,
        )}
      >
        {active.tag}
      </span>
    );
  }

  return (
    <label
      className="relative inline-flex shrink-0"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <select
        aria-label="Storage"
        value={active.sectionId}
        onChange={(event) => onPreferredSection(event.target.value as SectionId)}
        className={cn(
          "h-6 max-w-[7.5rem] appearance-none truncate rounded-md py-0 pr-5 pl-1.5 text-[11px] font-semibold uppercase tracking-wide outline-none ring-1",
          tone,
        )}
      >
        {variants.map((variant) => (
          <option key={variant.sectionId} value={variant.sectionId}>
            {variant.tag}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-1 size-3 -translate-y-1/2 opacity-80"
        aria-hidden
      />
    </label>
  );
}

