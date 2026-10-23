"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, RotateCcw, ScanLine, Trash2, Upload, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { ImportDialog } from "@/components/import-dialog";
import { ScanResult } from "@/components/scan-result";
import { StockBoard } from "@/components/stock-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { beepForStatus } from "@/lib/beep";
import {
  commitBeep,
  commitBook,
  getDeskServerSnapshot,
  getDeskSnapshot,
  subscribeDesk,
} from "@/lib/desk-store";
import {
  countByStatus,
  groupHits,
  hasExactCode,
  normalizeCode,
  searchLines,
} from "@/lib/search";
import { formatImportedAt, formatSheetDate, parseIsoDate, readExpiry } from "@/lib/dates";
import { buildSampleBook } from "@/lib/sample";
import type { BoardFilter, StockBook, StockLine } from "@/lib/types";

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadBook(book: StockBook) {
  const headers = [
    "Item code",
    "Barcode",
    "Item name",
    "Use by",
    "Qty",
    "Unit",
    "Location",
    "Batch",
    "Category",
  ];
  const rows = book.lines.map((line) => [
    line.code,
    line.altCode,
    line.name,
    line.expiry ? formatSheetDate(line.expiry) : line.expiryRaw,
    line.quantity,
    line.unit,
    line.location,
    line.batch,
    line.category,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileSlug(book.fileName);
  link.click();
  URL.revokeObjectURL(url);
}

function fileSlug(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  return `${base || "stock-dates"}.csv`;
}

export function StockDesk() {
  const desk = useSyncExternalStore(subscribeDesk, getDeskSnapshot, getDeskServerSnapshot);
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastBeep = useRef("");
  const book = desk?.book ?? null;
  const beepOn = desk?.beepOn ?? true;
  const today = desk ? parseIsoDate(desk.todayIso) : null;

  useEffect(() => {
    if (!book || importOpen) return;
    inputRef.current?.focus();
  }, [book, importOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => {
    if (!book || !query.trim()) return [];
    return groupHits(searchLines(book.lines, query));
  }, [book, query]);

  const exact = book ? hasExactCode(book.lines, query) : false;
  const showHero = groups.length > 0 && (committed || exact || groups.length === 1);
  const active = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;
  const beepKey = showHero && exact && active ? `${normalizeCode(query)}:${active.key}` : "";

  useEffect(() => {
    if (!beepKey || !beepOn || !today || !active || beepKey === lastBeep.current) return;
    lastBeep.current = beepKey;
    beepForStatus(readExpiry(active.lines[0]?.expiry ?? null, today).status);
  }, [beepKey, beepOn, today, active]);

  function remember(next: StockBook) {
    if (!commitBook(next)) {
      toast.error("That sheet is too large to keep in this browser.");
      return false;
    }
    setQuery("");
    setCommitted(false);
    setSelectedKey(null);
    return true;
  }

  function openLine(line: StockLine) {
    setQuery(line.code);
    setSelectedKey(normalizeCode(line.code) || line.name.toLowerCase());
    setCommitted(true);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function pickGroup(group: { key: string; code: string }) {
    setQuery(group.code);
    setSelectedKey(group.key);
    setCommitted(true);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.select());
  }

  if (!book || !today) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-stone-200" />
        <div className="mt-6 h-16 animate-pulse rounded-2xl bg-stone-200" />
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-stone-200" />
      </main>
    );
  }

  const counts = countByStatus(book.lines, today);
  const dueWeek = counts.today + counts.critical + counts.soon;

  return (
    <>
      <header className="border-b border-red-700/40 bg-[#172033] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-300">
                Domino&apos;s makeline
              </p>
              <h1 className="font-display text-4xl leading-none text-white">Stock dates</h1>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                className="h-10 bg-white text-stone-950 hover:bg-stone-100"
                onClick={() => setImportOpen(true)}
              >
                <Upload />
                Import sheet
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={() => downloadBook(book)}
                disabled={book.lines.length === 0}
              >
                <Download />
                Download
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={() => {
                  if (remember(buildSampleBook(new Date()))) {
                    toast.success("Sample makeline sheet loaded");
                  }
                }}
              >
                <RotateCcw />
                Sample
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={() => {
                  const empty: StockBook = {
                    fileName: "Empty sheet",
                    importedAt: new Date().toISOString(),
                    source: "import",
                    lines: [],
                  };
                  if (!remember(empty)) return;
                  toast("Sheet cleared");
                }}
              >
                <Trash2 />
                Clear
              </Button>
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-white/70">
            Import the latest stock expire datasheet, then scan a barcode or type the item code.
            The use-by date comes up on its own.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {book.source === "sample" ? (
          <p className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
            Showing a sample makeline sheet so you can try a scan. Import your latest expire datasheet to replace it.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Expired" value={counts.expired} tone={counts.expired > 0 ? "bad" : "calm"} />
          <Stat label="Due in 7 days" value={dueWeek} tone={dueWeek > 0 ? "soon" : "calm"} />
          <Stat label="Lines on the sheet" value={book.lines.length} tone="calm" />
        </div>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            setCommitted(true);
            requestAnimationFrame(() => inputRef.current?.select());
          }}
        >
          <label htmlFor="item-scan" className="mb-2 flex items-center gap-2 text-sm font-medium text-stone-700">
            <ScanLine className="size-4" />
            Scan or type an item
          </label>
          <div className="flex gap-2">
            <Input
              id="item-scan"
              ref={inputRef}
              value={query}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Barcode, item code, or name"
              className="h-14 rounded-2xl bg-white px-4 text-lg shadow-[4px_4px_0_0_rgba(28,25,23,0.08)] md:text-lg"
              onChange={(event) => {
                setQuery(event.target.value);
                setCommitted(false);
                setSelectedKey(null);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-14 rounded-2xl bg-white px-3"
              aria-pressed={beepOn}
              aria-label={beepOn ? "Turn scan beep off" : "Turn scan beep on"}
              onClick={() => commitBeep(!beepOn)}
            >
              {beepOn ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            A scanner types the code and presses Enter. Press / to jump back to this box.
            {book.fileName ? ` Sheet: ${book.fileName}, loaded ${formatImportedAt(book.importedAt)}.` : ""}
          </p>
        </form>

        {query.trim() ? (
          <div className="mt-5">
            <ScanResult
              query={query}
              groups={groups}
              activeKey={active?.key ?? null}
              showHero={showHero}
              today={today}
              onPick={pickGroup}
            />
          </div>
        ) : book.lines.length > 0 ? (
          <p className="mt-5 rounded-2xl bg-white/80 px-4 py-5 text-sm text-stone-600 ring-1 ring-stone-200">
            {book.source === "sample" ? (
              <>
                Ready to scan. Try <span className="font-mono text-stone-900">DOUGH14</span>,{" "}
                <span className="font-mono text-stone-900">CHICK</span>, or barcode{" "}
                <span className="font-mono text-stone-900">5010000000201</span>.
              </>
            ) : (
              <>Ready to scan. Type a code from {book.fileName}, or scan the barcode.</>
            )}
          </p>
        ) : null}

        {book.lines.length > 0 ? (
          <StockBoard
            book={book}
            query={query}
            filter={filter}
            today={today}
            onFilter={setFilter}
            onOpenLine={openLine}
          />
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white/80 px-5 py-10 text-center">
            <p className="font-display text-3xl text-stone-950">No stock loaded</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
              Import the latest expire datasheet, or load the sample makeline to see how a scan works.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button type="button" className="h-10" onClick={() => setImportOpen(true)}>
                <Upload />
                Import sheet
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 bg-white"
                onClick={() => {
                  if (remember(buildSampleBook(new Date()))) {
                    toast.success("Sample makeline sheet loaded");
                  }
                }}
              >
                Load sample
              </Button>
            </div>
          </div>
        )}
      </main>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(next) => {
          if (!remember(next)) return;
          setImportOpen(false);
          toast.success(`Imported ${next.lines.length} lines from ${next.fileName}`);
        }}
      />
      <Toaster position="top-center" />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "bad" | "soon" | "calm";
}) {
  const toneClass =
    tone === "bad"
      ? "bg-red-700 text-white"
      : tone === "soon"
        ? "bg-amber-100 text-amber-950 ring-1 ring-amber-200"
        : "bg-white text-stone-950 ring-1 ring-stone-200";
  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="font-display text-4xl leading-none tabular-nums">{value}</p>
    </div>
  );
}
