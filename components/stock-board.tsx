import { formatLongDate, readExpiry } from "@/lib/dates";
import { compareByExpiry, lineMatchesFilter, searchLines } from "@/lib/search";
import type { BoardFilter, StockBook, StockLine } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";
import { cn } from "cn";

const FILTERS: { id: BoardFilter; label: string }[] = [
  { id: "all", label: "All lines" },
  { id: "expired", label: "Expired" },
  { id: "week", label: "Due in 7 days" },
  { id: "fortnight", label: "Due in 14 days" },
  { id: "missing", label: "No date" },
];

const LIMIT = 150;

function countFilter(lines: StockLine[], filter: BoardFilter, today: Date) {
  if (filter === "all") return lines.length;
  return lines.filter((line) => lineMatchesFilter(line, filter, today)).length;
}

function quantityLabel(line: StockLine) {
  if (!line.quantity) return "—";
  return line.unit ? `${line.quantity} ${line.unit}` : line.quantity;
}

export function StockBoard({
  book,
  query,
  filter,
  today,
  onFilter,
  onOpenLine,
}: {
  book: StockBook;
  query: string;
  filter: BoardFilter;
  today: Date;
  onFilter: (filter: BoardFilter) => void;
  onOpenLine: (line: StockLine) => void;
}) {
  const searching = query.trim().length > 0;
  const rows = searching
    ? searchLines(book.lines, query)
    : book.lines.filter((line) => lineMatchesFilter(line, filter, today)).sort(compareByExpiry);
  const visible = rows.slice(0, LIMIT);

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-stone-950">On the sheet</h2>
          <p className="text-sm text-stone-600">
            {searching
              ? "Search matches, soonest use-by first. Filters wait until the box is cleared."
              : "Soonest use-by dates first. Tap a line to open it."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter stock lines">
          {FILTERS.map((item) => {
            const count = countFilter(book.lines, item.id, today);
            const selected = !searching && filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                disabled={count === 0 && item.id !== "all"}
                onClick={() => onFilter(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-40",
                  selected
                    ? "bg-stone-950 text-white ring-stone-950"
                    : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50",
                )}
              >
                {item.label}
                <span className={cn("ml-1.5 tabular-nums", selected ? "text-white/70" : "text-stone-400")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-8 text-center text-sm text-stone-600">
          Nothing in this view.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2 md:hidden">
            {visible.map((line) => {
              const readout = readExpiry(line.expiry, today);
              return (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => onOpenLine(line)}
                    className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-stone-200"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block font-medium">{line.name}</span>
                        <span className="mt-1 block font-mono text-xs text-stone-500">{line.code}</span>
                      </span>
                      <StatusPill status={readout.status}>{readout.label}</StatusPill>
                    </span>
                    <span className="mt-3 block text-sm text-stone-600">
                      {line.expiry ? formatLongDate(line.expiry) : "No use-by date"} · {readout.detail}
                    </span>
                    <span className="mt-1 block text-xs text-stone-500">
                      {[line.location, line.batch, quantityLabel(line)].filter((part) => part && part !== "—").join(" · ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 hidden overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Use by</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Where</th>
                  <th className="px-4 py-3 font-medium">Batch</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => {
                  const readout = readExpiry(line.expiry, today);
                  return (
                    <tr
                      key={line.id}
                      className="cursor-pointer border-t border-stone-100 hover:bg-amber-50/60"
                      onClick={() => onOpenLine(line)}
                    >
                      <td className="px-4 py-3">
                        <StatusPill status={readout.status}>{readout.label}</StatusPill>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="block font-medium">
                          {line.expiry ? formatLongDate(line.expiry) : "No date"}
                        </span>
                        <span className="text-xs text-stone-500">{readout.detail}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-normal">
                        <span className="block font-medium">{line.name}</span>
                        <span className="font-mono text-xs text-stone-500">
                          {line.code}
                          {line.altCode ? ` · ${line.altCode}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{quantityLabel(line)}</td>
                      <td className="px-4 py-3">{line.location || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{line.batch || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > LIMIT ? (
            <p className="mt-3 text-sm text-stone-500">
              Showing {LIMIT} of {rows.length}. Narrow the search to see the rest.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
