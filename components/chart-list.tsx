import { sectionById } from "@/lib/chart";
import type { SectionId, ShelfRule } from "@/lib/types";

function summary(rule: ShelfRule) {
  return [
    rule.fromDelivery ? `${rule.fromDelivery} from delivery` : "",
    rule.inUse ? `${rule.inUse} in use` : "",
    rule.unopened ? `Unopened ${rule.unopened}` : "",
    rule.prepped ? `Prepped ${rule.prepped}` : "",
    rule.ambientUse ? `Ambient ${rule.ambientUse}` : "",
    rule.also ? rule.also.value : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ChartList({
  rules,
  section,
  onOpen,
}: {
  rules: ShelfRule[];
  section: SectionId | "all";
  onOpen: (name: string) => void;
}) {
  const visible = section === "all" ? rules : rules.filter((rule) => rule.sectionId === section);
  const groups = new Map<SectionId, ShelfRule[]>();
  for (const rule of visible) {
    const list = groups.get(rule.sectionId) ?? [];
    list.push(rule);
    groups.set(rule.sectionId, list);
  }

  return (
    <div className="mt-4 space-y-8">
      {[...groups.entries()].map(([id, items]) => {
        const meta = sectionById(id);
        return (
          <section key={id}>
            <h2 className="font-display text-2xl text-stone-950">{meta.title}</h2>
            {meta.note ? <p className="mt-1 text-sm text-stone-600">{meta.note}</p> : null}
            <ul className="mt-3 divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              {items.map((rule) => (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(rule.name)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-amber-50 sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <span>
                      <span className="block font-medium text-stone-950">{rule.name}</span>
                      <span className="text-xs uppercase tracking-wide text-stone-500">{rule.category}</span>
                    </span>
                    <span className="text-sm text-stone-600 sm:text-right">{summary(rule)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
