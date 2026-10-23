import { readExpiry } from "./dates";
import type { BoardFilter, StockLine, StockStatus } from "./types";

export function cleanScan(raw: string): string {
  let value = raw.trim();
  value = value.replace(/^\][A-Za-z0-9]{2}/, "");
  value = value.replace(/^\*+|\*+$/g, "");
  return value.trim();
}

export function normalizeCode(value: string): string {
  return cleanScan(value).toUpperCase().replace(/[\s-]/g, "");
}

export function compareByExpiry(a: StockLine, b: StockLine): number {
  if (a.expiry && b.expiry) return a.expiry.localeCompare(b.expiry);
  if (a.expiry) return -1;
  if (b.expiry) return 1;
  return a.name.localeCompare(b.name);
}

function rankLine(line: StockLine, query: string): number {
  const needle = normalizeCode(query);
  const folded = cleanScan(query).toLowerCase();
  const codes = [normalizeCode(line.code), normalizeCode(line.altCode)].filter(
    Boolean,
  );
  const name = line.name.toLowerCase();
  const batch = normalizeCode(line.batch);

  if (needle && codes.some((code) => code === needle)) return 0;
  if (needle && batch && batch === needle) return 1;
  if (needle && codes.some((code) => code.startsWith(needle))) return 2;
  if (needle.length >= 4 && codes.some((code) => code.includes(needle))) return 3;
  if (folded.length >= 2 && name === folded) return 4;
  if (folded.length >= 2 && name.startsWith(folded)) return 5;
  if (folded.length >= 3 && name.includes(folded)) return 6;
  if (folded.length >= 2 && line.category.toLowerCase().includes(folded)) return 7;
  return -1;
}

export function searchLines(lines: StockLine[], query: string): StockLine[] {
  const trimmed = cleanScan(query);
  if (!trimmed) return [];

  return lines
    .map((line) => ({ line, rank: rankLine(line, trimmed) }))
    .filter((hit) => hit.rank >= 0)
    .sort(
      (a, b) => a.rank - b.rank || compareByExpiry(a.line, b.line),
    )
    .map((hit) => hit.line);
}

export type ProductGroup = {
  key: string;
  code: string;
  altCode: string;
  name: string;
  category: string;
  lines: StockLine[];
};

export function groupHits(hits: StockLine[]): ProductGroup[] {
  const order: string[] = [];
  const groups = new Map<string, StockLine[]>();

  for (const line of hits) {
    const key = normalizeCode(line.code) || line.name.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.push(line);
      continue;
    }
    groups.set(key, [line]);
    order.push(key);
  }

  return order.map((key) => {
    const lines = groups.get(key)!.slice().sort(compareByExpiry);
    const first = lines[0];
    return {
      key,
      code: first.code,
      altCode: first.altCode,
      name: first.name,
      category: first.category,
      lines,
    };
  });
}

export function hasExactCode(lines: StockLine[], query: string): boolean {
  const needle = normalizeCode(query);
  if (!needle) return false;
  return lines.some((line) => {
    const codes = [normalizeCode(line.code), normalizeCode(line.altCode)];
    return codes.includes(needle) || normalizeCode(line.batch) === needle;
  });
}

export function lineMatchesFilter(
  line: StockLine,
  filter: BoardFilter,
  today: Date,
): boolean {
  if (filter === "all") return true;
  const readout = readExpiry(line.expiry, today);
  if (filter === "expired") return readout.status === "expired";
  if (filter === "missing") return readout.status === "missing";
  if (filter === "week") {
    return readout.days != null && readout.days >= 0 && readout.days <= 7;
  }
  return readout.days != null && readout.days >= 0 && readout.days <= 14;
}

export function countByStatus(
  lines: StockLine[],
  today: Date,
): Record<StockStatus, number> {
  const counts: Record<StockStatus, number> = {
    expired: 0,
    today: 0,
    critical: 0,
    soon: 0,
    watch: 0,
    ok: 0,
    missing: 0,
  };
  for (const line of lines) {
    counts[readExpiry(line.expiry, today).status] += 1;
  }
  return counts;
}
