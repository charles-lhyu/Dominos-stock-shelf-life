"use client";

import { ChevronDown } from "lucide-react";
import { WhenDate } from "@/components/when-date";
import {
  categoriesInPack,
  datePreview,
  LIFE_KIND_META,
  lifeKindsForRule,
  pickLifeKind,
  pickVariant,
  sectionMatchesFilter,
  toppingGroup,
  uniqueNamesInCategory,
  variantsForName,
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
  onOpen,
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
  onOpen: (name: string, sectionId: SectionId) => void;
}) {
  const categories = category === "all" ? categoriesInPack(pack) : [category];

  return (
    <div className="mt-4 space-y-6 select-none">
      {categories.map((cat) => {
        const names = uniqueNamesInCategory(pack.rules, cat);
        const rows = names.flatMap((name) => {
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

          const sectionPreference =
            sectionFilter !== "all" ? sectionFilter : preferredSection;
          const active = pickVariant(variants, sectionPreference);
          if (!active) return [];

          const kinds = lifeKindsForRule(active.rule);
          const lifePreference = lifeFilter !== "all" ? lifeFilter : preferredLife;
          const activeLife = pickLifeKind(kinds, lifePreference);
          const preview = datePreview(active.rule, deliveryDate, activeLife, today);

          return [
            {
              name,
              variants,
              active,
              kinds,
              activeLife,
              preview,
            },
          ];
        });

        if (rows.length === 0) return null;

        const showToppingGroups = cat === "Toppings";
        const groupStarts = new Set<string>();
        if (showToppingGroups) {
          let prev: ToppingGroup | null = null;
          for (const row of rows) {
            const group = toppingGroup(row.name);
            if (group !== prev) {
              groupStarts.add(row.name);
              prev = group;
            }
          }
        }

        return (
          <section key={cat}>
            <h2 className="font-display text-lg text-white">{cat}</h2>
            <ul className="mt-2 divide-y divide-white/10">
              {rows.map(({ name, variants, active, kinds, activeLife, preview }) => {
                const group = showToppingGroups ? toppingGroup(name) : null;
                const showGroupLabel = group != null && groupStarts.has(name);

                return (
                  <li key={`${cat}:${name}`}>
                    {showGroupLabel && group ? (
                      <p className="mb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        {TOPPING_GROUP_LABEL[group]}
                      </p>
                    ) : null}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${name}`}
                      className="min-h-14 touch-pan-y rounded-xl py-2.5 transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
                      onClick={() => onOpen(name, active.sectionId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(name, active.sectionId);
                        }
                      }}
                    >
                      <div className="flex w-full min-w-0 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium text-white">
                          {name}
                        </span>
                        <WhenDate
                          when={preview.when}
                          at={preview.at}
                          className={cn(
                            "shrink-0 touch-pan-y text-sm leading-snug whitespace-nowrap",
                            preview.tone === "neutral"
                              ? "text-stone-400"
                              : "text-emerald-300",
                          )}
                        />
                      </div>
                      {/* flex-wrap (not overflow-x) so vertical list scroll isn’t stolen.
                          Row clicks open the card; only the tag buttons stop propagation. */}
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
                                const index = kinds.indexOf(activeLife);
                                const next = kinds[(index + 1) % kinds.length]!;
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
