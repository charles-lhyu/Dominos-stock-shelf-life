"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildLines,
  detectMapping,
  FIELD_LABELS,
  mappingProblem,
} from "@/lib/columns";
import { formatLongDate } from "@/lib/dates";
import { readWorkbook } from "@/lib/sheet";
import type { ColumnMapping, MappedField, SheetTable, StockBook } from "@/lib/types";

const ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FIELD_ORDER: MappedField[] = [
  "expiry",
  "code",
  "altCode",
  "name",
  "quantity",
  "location",
  "batch",
  "unit",
  "category",
];

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (book: StockBook) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [tables, setTables] = useState<SheetTable[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const table = tables[sheetIndex] ?? null;
  const built = useMemo(() => {
    if (!table || !mapping) return null;
    return buildLines(table, mapping);
  }, [table, mapping]);
  const problem = mapping ? mappingProblem(mapping) : null;

  function reset() {
    setFileName("");
    setTables([]);
    setSheetIndex(0);
    setMapping(null);
    setError(null);
    setBusy(false);
  }

  async function loadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const nextTables = await readWorkbook(file);
      if (nextTables.length === 0) {
        setError("That file has no rows with a header.");
        setTables([]);
        setMapping(null);
        return;
      }
      setFileName(file.name);
      setTables(nextTables);
      setSheetIndex(0);
      setMapping(detectMapping(nextTables[0].headers));
    } catch {
      setError("That file could not be read. Use a .csv or .xlsx sheet.");
      setTables([]);
      setMapping(null);
    } finally {
      setBusy(false);
    }
  }

  function chooseSheet(index: number) {
    const next = tables[index];
    if (!next) return;
    setSheetIndex(index);
    setMapping(detectMapping(next.headers));
  }

  function confirmImport() {
    if (!table || !mapping || !built) return;
    if (problem) {
      toast.error(problem);
      return;
    }
    if (built.lines.length === 0) {
      toast.error("None of the rows had an item code or name.");
      return;
    }
    onImported({
      fileName: tables.length > 1 ? `${fileName} · ${table.sheetName}` : fileName,
      importedAt: new Date().toISOString(),
      source: "import",
      lines: built.lines,
    });
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[min(90vh,860px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import the latest expire sheet</DialogTitle>
          <DialogDescription>
            Upload the current stock datasheet. CSV and Excel both work. The use-by column can be named Use by, Expiry, or Best before, in day/month/year.
          </DialogDescription>
        </DialogHeader>

        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center ${
            dragOver ? "border-red-500 bg-red-50" : "border-stone-300 bg-stone-50"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void loadFile(file);
          }}
        >
          <Upload className="size-5 text-stone-500" />
          <span className="text-sm font-medium">
            {busy ? "Reading sheet…" : "Drop the datasheet here, or browse"}
          </span>
          <span className="text-xs text-stone-500">.csv, .xlsx, .xls</span>
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void loadFile(file);
            }}
          />
        </label>
        <p className="text-xs text-stone-500">
          Need a shape to copy?{" "}
          <a className="underline" href="/example-expire-sheet.csv" download>
            Download an example sheet
          </a>
          .
        </p>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        {table && mapping ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <FileSpreadsheet className="size-4" />
              <span className="font-medium text-stone-900">{fileName}</span>
              <span>
                {table.rows.length} rows
                {tables.length > 1 ? ` · sheet ${sheetIndex + 1} of ${tables.length}` : ""}
              </span>
            </div>

            {tables.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {tables.map((item, index) => (
                  <Button
                    key={item.sheetName}
                    type="button"
                    size="sm"
                    variant={index === sheetIndex ? "default" : "outline"}
                    onClick={() => chooseSheet(index)}
                  >
                    {item.sheetName}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELD_ORDER.map((field) => (
                <label key={field} className="grid gap-1.5 text-sm">
                  <span className="font-medium">
                    {FIELD_LABELS[field]}
                    {field === "expiry" || field === "code" ? " *" : ""}
                  </span>
                  <Select
                    value={mapping[field] == null ? "__none__" : String(mapping[field])}
                    onValueChange={(value) => {
                      const index = value == null || value === "__none__" ? null : Number(value);
                      setMapping((current) =>
                        current
                          ? { ...current, [field]: Number.isNaN(index) ? null : index }
                          : current,
                      );
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      <SelectItem value="__none__">Not in this sheet</SelectItem>
                      {table.headers.map((header, index) => (
                        <SelectItem key={`${header}-${index}`} value={String(index)}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </div>

            {problem ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{problem}</p>
            ) : null}
            {built && built.unreadableDates > 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {built.unreadableDates} {built.unreadableDates === 1 ? "date was" : "dates were"} not
                readable. Those lines still import, with no use-by date.
              </p>
            ) : null}

            {built && built.lines.length > 0 ? (
              <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Use by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {built.lines.slice(0, 5).map((line) => (
                      <tr key={line.id} className="border-t border-stone-100">
                        <td className="px-3 py-2 font-mono text-xs">{line.code}</td>
                        <td className="px-3 py-2">{line.name}</td>
                        <td className="px-3 py-2">
                          {line.expiry ? formatLongDate(line.expiry) : "No date"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!built || built.lines.length === 0 || Boolean(problem)}
            onClick={confirmImport}
          >
            {built ? `Replace stock with ${built.lines.length} lines` : "Replace stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
