export type StockStatus =
  | "expired"
  | "today"
  | "critical"
  | "soon"
  | "watch"
  | "ok"
  | "missing";

export type StockLine = {
  id: string;
  code: string;
  altCode: string;
  name: string;
  expiry: string | null;
  expiryRaw: string;
  quantity: string;
  unit: string;
  location: string;
  batch: string;
  category: string;
};

export type StockBook = {
  fileName: string;
  importedAt: string;
  source: "sample" | "import";
  lines: StockLine[];
};

export type SheetTable = {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
};

export const MAPPED_FIELDS = [
  "code",
  "altCode",
  "name",
  "expiry",
  "quantity",
  "unit",
  "location",
  "batch",
  "category",
] as const;

export type MappedField = (typeof MAPPED_FIELDS)[number];

export type ColumnMapping = Record<MappedField, number | null>;

export type BoardFilter = "all" | "expired" | "week" | "fortnight" | "missing";

export type BuildResult = {
  lines: StockLine[];
  unreadableDates: number;
  skippedRows: number;
};
