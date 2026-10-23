import { formatLongDate, readExpiry } from "@/lib/dates";
import type { ProductGroup } from "@/lib/search";
import { StatusPill, statusPanel } from "@/components/status-pill";
import { cn } from "cn";

function quantityLabel(quantity: string, unit: string) {
  if (!quantity) return "";
  return unit ? `${quantity} ${unit}` : quantity;
}

export function ScanResult({
  query,
  groups,
  activeKey,
  showHero,
  today,
  onPick,
}: {
  query: string;
  groups: ProductGroup[];
  activeKey: string | null;
  showHero: boolean;
  today: Date;
  onPick: (group: ProductGroup) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 px-5 py-8 text-center">
        <p className="font-display text-2xl text-stone-900">No match for “{query.trim()}”</p>
        <p className="mt-2 text-sm text-stone-600">
          That code is not on the current sheet. Check the item code column, or import a newer expire datasheet.
        </p>
      </div>
    );
  }

  const active = groups.find((group) => group.key === activeKey) ?? groups[0];

  if (!showHero || !active) {
    return (
      <div className="rounded-2xl bg-white p-3 shadow-[4px_4px_0_0_rgba(28,25,23,0.08)] ring-1 ring-stone-200">
        <p className="px-2 py-1 text-sm text-stone-600">
          {groups.length} items match. Choose one, or keep typing the code.
        </p>
        <ul className="mt-1 divide-y divide-stone-100">
          {groups.slice(0, 8).map((group) => (
            <MatchRow key={group.key} group={group} today={today} onPick={onPick} />
          ))}
        </ul>
      </div>
    );
  }

  const soonest = active.lines[0];
  const readout = readExpiry(soonest.expiry, today);
  const expired = active.lines.filter(
    (line) => readExpiry(line.expiry, today).status === "expired",
  );
  const inDate = active.lines.filter((line) => {
    const days = readExpiry(line.expiry, today).days;
    return days != null && days >= 0;
  });
  const loud =
    readout.status === "expired" ||
    readout.status === "today" ||
    readout.status === "critical";
  const others = groups.filter((group) => group.key !== active.key);

  return (
    <div className="space-y-3" aria-live="polite">
      <article
        className={cn(
          "ticket-in overflow-hidden rounded-2xl shadow-[6px_6px_0_0_rgba(28,25,23,0.12)] ring-1 ring-black/10",
          statusPanel(readout.status),
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-7">
          <StatusPill status={readout.status} className={loud ? "bg-white/15 text-white ring-1 ring-white/30" : ""}>
            {readout.label}
          </StatusPill>
          <p className={cn("text-sm", loud ? "text-white/80" : "text-stone-500")}>
            {active.category || "Stock line"}
            {active.lines.length > 1 ? ` · ${active.lines.length} batches` : ""}
          </p>
        </div>
        <div className="px-5 pt-4 pb-6 sm:px-7">
          <h2 className="font-display text-3xl leading-tight sm:text-4xl">{active.name}</h2>
          <p className={cn("mt-2 font-mono text-sm", loud ? "text-white/80" : "text-stone-500")}>
            {active.code}
            {active.altCode ? ` · ${active.altCode}` : ""}
          </p>
          <p className="mt-6 font-display text-5xl leading-none tracking-tight sm:text-7xl">
            {soonest.expiry ? formatLongDate(soonest.expiry) : "No date"}
          </p>
          <p className={cn("mt-3 text-xl font-medium", loud ? "text-white" : "text-stone-700")}>
            {readout.detail}
          </p>
          <dl className={cn("mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm", loud ? "text-white/90" : "text-stone-600")}>
            {soonest.batch ? (
              <div>
                <dt className="text-xs uppercase tracking-wider opacity-70">Batch</dt>
                <dd className="font-medium">{soonest.batch}</dd>
              </div>
            ) : null}
            {soonest.location ? (
              <div>
                <dt className="text-xs uppercase tracking-wider opacity-70">Location</dt>
                <dd className="font-medium">{soonest.location}</dd>
              </div>
            ) : null}
            {quantityLabel(soonest.quantity, soonest.unit) ? (
              <div>
                <dt className="text-xs uppercase tracking-wider opacity-70">Quantity</dt>
                <dd className="font-medium">{quantityLabel(soonest.quantity, soonest.unit)}</dd>
              </div>
            ) : null}
          </dl>
          {expired.length > 0 && inDate.length > 0 ? (
            <p className={cn("mt-5 rounded-xl px-3 py-2 text-sm font-medium", loud ? "bg-black/15" : "bg-red-50 text-red-800")}>
              Pull batch {expired[0].batch || expired[0].code}. Batch {inDate[0].batch || inDate[0].code} is still in date
              {inDate[0].expiry ? ` until ${formatLongDate(inDate[0].expiry)}` : ""}.
            </p>
          ) : null}
        </div>
        {active.lines.length > 1 ? (
          <div className={cn("border-t px-5 py-4 sm:px-7", loud ? "border-white/20" : "border-stone-200")}>
            <p className={cn("text-xs font-semibold uppercase tracking-wider", loud ? "text-white/70" : "text-stone-500")}>
              All batches, soonest first
            </p>
            <ul className="mt-2 space-y-1.5">
              {active.lines.map((line) => {
                const lineRead = readExpiry(line.expiry, today);
                return (
                  <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {line.expiry ? formatLongDate(line.expiry) : "No date"}
                      <span className={cn("ml-2", loud ? "text-white/75" : "text-stone-500")}>
                        {lineRead.detail}
                      </span>
                    </span>
                    <span className={loud ? "text-white/80" : "text-stone-500"}>
                      {[line.batch, line.location, quantityLabel(line.quantity, line.unit)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </article>
      {others.length > 0 ? (
        <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
          <p className="px-2 py-1 text-sm text-stone-600">Other matches</p>
          <ul className="divide-y divide-stone-100">
            {others.slice(0, 6).map((group) => (
              <MatchRow key={group.key} group={group} today={today} onPick={onPick} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MatchRow({
  group,
  today,
  onPick,
}: {
  group: ProductGroup;
  today: Date;
  onPick: (group: ProductGroup) => void;
}) {
  const soonest = group.lines[0];
  const readout = readExpiry(soonest.expiry, today);
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(group)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left hover:bg-stone-50"
      >
        <span>
          <span className="block font-medium text-stone-950">{group.name}</span>
          <span className="mt-0.5 block font-mono text-xs text-stone-500">
            {group.code}
            {group.altCode ? ` · ${group.altCode}` : ""}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusPill status={readout.status}>{readout.label}</StatusPill>
          <span className="text-xs text-stone-500">
            {soonest.expiry ? formatLongDate(soonest.expiry) : "No date"}
          </span>
        </span>
      </button>
    </li>
  );
}
