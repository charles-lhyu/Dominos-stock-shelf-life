"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { WhenDate } from "@/components/when-date";
import {
  categoriesInPack,
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
  // Use the non-sticky section wrapper — a stuck header's getBoundingClientRect
  // is already at the top, so scrolling it does nothing.
  const top =
    section.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop;
  scroller.scrollTop = Math.max(0, top);
}

export function ChartList({
  pack,
  category,
  deliveryDate,
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
  const categories = category === "all" ? categoriesInPack(pack) : [category];
  const blocks: StickyBlock[] = [];

  for (const cat of categories) {
    const names = uniqueNamesInCategory(pack.rules, cat);
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
      const activeLife = pickLifeKind(kinds, lifePreference);
      const preview = datePreview(active.rule, deliveryDate, activeLife, today);

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

  const actions = {
    onOpen,
    onPreferredSection,
    onPreferredLife,
    compact,
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

function renderCoverStack(
  blocks: StickyBlock[],
  index: number,
  actions: {
    onOpen: (name: string, sectionId: SectionId) => void;
    onPreferredSection: (section: SectionId) => void;
    onPreferredLife: (kind: LifeKind) => void;
    compact: boolean;
  },
): ReactNode {
  const block = blocks[index];
  if (!block) return null;

  const sectionTitle = block.label
    ? `${block.category}, ${block.label}`
    : block.category;

  return (
    <div key={block.key}>
      <button
        type="button"
        aria-label={`Go to ${sectionTitle}`}
        onClick={(event) => {
          const section = event.currentTarget.parentElement;
          if (section instanceof HTMLElement) scrollSectionToTop(section);
        }}
        className={cn(
          // No border-t — the header’s red rule + opaque hang seals the filter gap above.
          "sticky top-0 -mx-4 block w-[calc(100%+2rem)] border-b border-white/10 bg-[#0f1624] px-4 pt-1 pb-1.5 text-left",
          actions.compact && "pr-[11.5rem]",
        )}
        style={{ zIndex: 10 + index }}
      >
        <h2 className="font-display text-lg leading-tight text-white">{block.category}</h2>
        <p
          className={cn(
            "mt-1 text-[11px] font-semibold uppercase tracking-wider",
            block.label ? "text-stone-400" : "invisible",
          )}
          aria-hidden={block.label ? undefined : true}
        >
          {block.label ?? "Meats"}
        </p>
      </button>
      <ul className="divide-y divide-white/10">
        {block.rows.map((row) => (
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
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
              "shrink-0 touch-pan-y text-sm leading-snug whitespace-nowrap",
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

