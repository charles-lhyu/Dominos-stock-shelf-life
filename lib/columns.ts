import { parseExpiry } from "./dates";
import {
  MAPPED_FIELDS,
  type BuildResult,
  type ColumnMapping,
  type MappedField,
  type SheetTable,
  type StockLine,
} from "./types";

const ALIASES: Record<MappedField, string[]> = {
  code: [
    "item code",
    "product code",
    "stock code",
    "sku",
    "plu",
    "item no",
    "item number",
    "code",
  ],
  altCode: ["barcode", "bar code", "ean", "upc", "gtin", "scan code"],
  name: [
    "item name",
    "product name",
    "description",
    "ingredient",
    "product",
    "item",
  ],
  expiry: [
    "use by date",
    "use by",
    "best before date",
    "best before",
    "expiry date",
    "expire date",
    "expiration date",
    "expiration",
    "expiry",
    "expires",
    "exp date",
    "bbd",
    "date",
  ],
  quantity: ["quantity", "qty on hand", "on hand", "stock qty", "qty", "count"],
  unit: ["unit", "uom"],
  location: ["location", "storage", "fridge", "bin", "area", "station"],
  batch: ["batch no", "batch number", "lot no", "lot number", "batch", "lot"],
  category: ["category", "department", "group", "type"],
};

export const FIELD_LABELS: Record<MappedField, string> = {
  code: "Item code",
  altCode: "Barcode",
  name: "Item name",
  expiry: "Use-by date",
  quantity: "Quantity",
  unit: "Unit",
  location: "Location",
  batch: "Batch",
  category: "Category",
};

export function emptyMapping(): ColumnMapping {
  return {
    code: null,
    altCode: null,
    name: null,
    expiry: null,
    quantity: null,
    unit: null,
    location: null,
    batch: null,
    category: null,
  };
}

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scoreHeader(header: string, field: MappedField): number {
  const normalized = normalizeHeader(header);
  if (!normalized) return 0;

  if (
    field === "expiry" &&
    /(update|updated|delivery|received|created|modified|order)/.test(normalized) &&
    !/(use by|best before|expir|expire|expiration|bbd|exp date)/.test(normalized)
  ) {
    return 0;
  }

  let best = 0;
  for (const alias of ALIASES[field]) {
    if (normalized === alias) {
      best = Math.max(best, 100 + alias.length);
      continue;
    }
    const words = normalized.split(" ");
    if (alias.length >= 3 && words.includes(alias)) {
      best = Math.max(best, 70 + alias.length);
      continue;
    }
    if (alias.length >= 5 && normalized.includes(alias)) {
      best = Math.max(best, 50 + alias.length);
    }
  }
  return best;
}

export function detectMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  const pairs: { field: MappedField; index: number; score: number }[] = [];

  headers.forEach((header, index) => {
    for (const field of MAPPED_FIELDS) {
      const score = scoreHeader(header, field);
      if (score > 0) pairs.push({ field, index, score });
    }
  });

  pairs.sort((a, b) => b.score - a.score || a.index - b.index);

  const usedColumns = new Set<number>();
  const usedFields = new Set<MappedField>();
  for (const pair of pairs) {
    if (usedFields.has(pair.field) || usedColumns.has(pair.index)) continue;
    if (pair.score < 50) continue;
    mapping[pair.field] = pair.index;
    usedFields.add(pair.field);
    usedColumns.add(pair.index);
  }

  return mapping;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function readCell(row: unknown[], index: number | null): unknown {
  if (index == null) return "";
  return row[index] ?? "";
}

export function buildLines(table: SheetTable, mapping: ColumnMapping): BuildResult {
  const lines: StockLine[] = [];
  let unreadableDates = 0;
  let skippedRows = 0;

  table.rows.forEach((row, index) => {
    let code = cellText(readCell(row, mapping.code));
    const altCode = cellText(readCell(row, mapping.altCode));
    const name = cellText(readCell(row, mapping.name));
    if (!code && altCode) code = altCode;
    if (!code && !name) {
      skippedRows += 1;
      return;
    }

    const expiryValue = readCell(row, mapping.expiry);
    const expiryRaw = expiryValue instanceof Date ? "" : cellText(expiryValue);
    const expiry = mapping.expiry == null ? null : parseExpiry(expiryValue);
    if ((expiryRaw || expiryValue instanceof Date) && !expiry) {
      unreadableDates += 1;
    }

    lines.push({
      id: `${index + 1}-${code || name}`,
      code,
      altCode: altCode && altCode !== code ? altCode : "",
      name: name || code,
      expiry,
      expiryRaw: expiry ? "" : expiryRaw,
      quantity: cellText(readCell(row, mapping.quantity)),
      unit: cellText(readCell(row, mapping.unit)),
      location: cellText(readCell(row, mapping.location)),
      batch: cellText(readCell(row, mapping.batch)),
      category: cellText(readCell(row, mapping.category)),
    });
  });

  return { lines, unreadableDates, skippedRows };
}

export function mappingProblem(mapping: ColumnMapping): string | null {
  if (mapping.code == null && mapping.altCode == null) {
    return "Choose the column that holds the item code or barcode.";
  }
  if (mapping.expiry == null) {
    return "Choose the column that holds the use-by date.";
  }
  return null;
}
