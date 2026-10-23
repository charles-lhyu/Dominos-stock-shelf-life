import type { SheetTable } from "./types";

function looksLikeHeader(row: unknown[]): boolean {
  const labels = row.filter(
    (cell) => typeof cell === "string" && /[A-Za-z]/.test(cell),
  );
  return labels.length >= 2;
}

function headerText(cell: unknown, index: number): string {
  if (typeof cell === "string" && cell.trim()) return cell.trim();
  if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
  return `Column ${index + 1}`;
}

function sheetToTable(
  sheetName: string,
  rows: unknown[][],
): SheetTable | null {
  const headerIndex = rows.findIndex((row) => looksLikeHeader(row));
  if (headerIndex < 0) return null;
  const headers = (rows[headerIndex] ?? []).map(headerText);
  while (headers.length > 0 && /^Column \d+$/.test(headers[headers.length - 1] ?? "")) {
    const column = headers.length - 1;
    const hasValue = rows.slice(headerIndex + 1).some((row) => {
      const value = row[column];
      return value != null && String(value).trim() !== "";
    });
    if (hasValue) break;
    headers.pop();
  }

  const body = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""));

  if (body.length === 0) return null;
  return { sheetName, headers, rows: body };
}

export async function readWorkbook(file: File): Promise<SheetTable[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const tables: SheetTable[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    }) as unknown[][];
    const table = sheetToTable(sheetName, matrix);
    if (table) tables.push(table);
  }

  return tables;
}
