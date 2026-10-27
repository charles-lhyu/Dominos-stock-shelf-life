"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bug, EyeOff, Minus, Plus, X } from "lucide-react";
import { DateField, TimeField } from "@/components/date-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhenDate } from "@/components/when-date";
import { sectionFromPack } from "@/lib/chart-pack";
import { toIsoDate } from "@/lib/dates";
import { readDebug, subscribeDebug } from "@/lib/debug-store";
import { hideProductName } from "@/lib/hidden-store";
import { getPdfCropImage, getSourcePdf, putPdfCropImage } from "@/lib/pdf-crop-images";
import { cropOneProductRowImage } from "@/lib/pdf-chart";
import { capAdvice, clocksFor, projectClock, type Clock, type ClockResult } from "@/lib/life";
import { isPrintedPackDate, LIFE_KIND_META, prepClockTime, type LifeKind } from "@/lib/preview";
import type { ChartPack, ShelfRule, StockStatus } from "@/lib/types";
import { cn } from "cn";

const SECTION_TONE: Record<ShelfRule["sectionId"], string> = {
  frozen: "bg-sky-500/20 text-sky-200",
  chilled: "bg-teal-500/20 text-teal-200",
  ready: "bg-amber-500/20 text-amber-200",
  ambient: "bg-orange-500/20 text-orange-200",
  pack: "bg-stone-500/25 text-stone-200",
};

function toneClass(tone: StockStatus) {
  if (tone === "expired") return "text-red-400";
  if (tone === "today" || tone === "critical") return "text-orange-300";
  if (tone === "soon" || tone === "watch") return "text-amber-300";
  return "text-emerald-300";
}

function nowLocal() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${toIsoDate(now)}T${hours}:${minutes}`;
}

function initialValues(
  rule: ShelfRule,
  deliveryDate: string,
  prepTime: string,
  today: Date,
): Record<string, string> {
  if (!deliveryDate) return {};
  const values: Record<string, string> = {};
  for (const clock of clocksFor(rule)) {
    if (isPrintedPackDate(clock)) continue;
    if (clock.mode === "date") values[clock.id] = deliveryDate;
    if (clock.mode === "datetime") values[clock.id] = `${deliveryDate}T${prepClockTime(prepTime, today)}`;
  }
  return values;
}

function kindForClockId(id: string): LifeKind | null {
  for (const [kind, meta] of Object.entries(LIFE_KIND_META) as [LifeKind, (typeof LIFE_KIND_META)[LifeKind]][]) {
    if (meta.clockIds.includes(id)) return kind;
  }
  return null;
}

/** Prepped/in-use and ambient use are shown as a left/right pair. */
function clockRows(clocks: Clock[]): Clock[][] {
  const prepped = clocks.find((clock) => clock.id === "prepped" || clock.id === "use");
  const ambient = clocks.find((clock) => clock.id === "ambient");
  const paired = new Set<string>();
  const rows: Clock[][] = [];

  if (prepped && ambient) {
    rows.push([prepped, ambient]);
    paired.add(prepped.id);
    paired.add(ambient.id);
  }

  for (const clock of clocks) {
    if (paired.has(clock.id)) continue;
    rows.push([clock]);
  }
  return rows;
}

export function LifeCard({
  rule,
  pack,
  deliveryDate = "",
  prepTime = "",
  focusKind = null,
  onHidden,
}: {
  rule: ShelfRule;
  pack: ChartPack;
  deliveryDate?: string;
  prepTime?: string;
  focusKind?: LifeKind | null;
  /** Called after the product is hidden from the list. */
  onHidden?: () => void;
}) {
  const clocks = clocksFor(rule);
  const focusIds = new Set(
    focusKind === "prepped"
      ? clocks.filter((clock) => {
          const kind = kindForClockId(clock.id);
          return kind === "prepped" || kind === "ambient";
        }).map((clock) => clock.id)
      : focusKind
        ? clocks.filter((clock) => kindForClockId(clock.id) === focusKind).map((clock) => clock.id)
        : [],
  );
  const ordered =
    focusIds.size > 0
      ? [
          ...clocks.filter((clock) => focusIds.has(clock.id)),
          ...clocks.filter((clock) => !focusIds.has(clock.id)),
        ]
      : clocks;
  const rows = clockRows(ordered);
  const section = sectionFromPack(pack, rule.sectionId);
  const debugOn = useSyncExternalStore(subscribeDebug, readDebug, () => false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const seeded = initialValues(rule, deliveryDate, prepTime, new Date());
    setValues(seeded);
    setCheckedAt(Object.keys(seeded).length > 0 ? new Date() : null);
  }, [rule.id, deliveryDate, prepTime]);

  useEffect(() => {
    setDebugOpen(false);
  }, [rule.id]);

  const results = checkedAt
    ? clocks
        .map((clock) => projectClock(clock, values[clock.id] ?? "", checkedAt))
        .filter((result): result is ClockResult => result != null)
    : [];
  const advice = capAdvice(results);

  function setClock(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
    setCheckedAt(new Date());
  }

  function renderClock(clock: Clock) {
    const result = results.find((item) => item.id === clock.id);
    const focused = focusIds.size > 0 ? focusIds.has(clock.id) : false;
    const datetime = clock.mode === "datetime";
    const raw = values[clock.id] ?? "";
    const datePart = datetime ? raw.slice(0, 10) : raw;
    const timePart = datetime && raw.includes("T") ? raw.slice(11, 16) : "00:00";

    return (
      <div
        key={clock.id}
        className={cn(
          "min-w-0 max-w-full overflow-hidden rounded-xl bg-black/25 px-3 py-3 ring-1 sm:px-4",
          focused ? "ring-violet-300/60" : "ring-white/10",
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          {clock.id === "ambient"
            ? "Ambient use"
            : clock.id === "prepped" || clock.id === "use"
              ? clock.chilled
                ? "Prepped (Chilled)"
                : "Prepped"
              : clock.label}
        </p>
        <p className="font-display text-3xl leading-none break-words text-white">{clock.value}</p>
        {clock.mode !== "display" && !isPrintedPackDate(clock) ? (
          <div className="mt-3 min-w-0 space-y-2">
            {datetime ? (
              <>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <DateField
                    label={
                      clock.id === "ambient"
                        ? "Ambient date"
                        : clock.id === "prepped" || clock.id === "use"
                          ? "Prepped on"
                          : clock.prompt
                    }
                    value={datePart}
                    onChange={(next) => setClock(clock.id, `${next}T${timePart || "00:00"}`)}
                  />
                  <TimeField
                    label="Time"
                    value={timePart}
                    onChange={(next) =>
                      setClock(clock.id, `${datePart || toIsoDate(new Date())}T${next}`)
                    }
                  />
                </div>
                <button
                  type="button"
                  className="h-11 w-full rounded-2xl bg-white text-sm font-semibold text-stone-950 transition-transform active:scale-[0.99]"
                  onClick={() => setClock(clock.id, nowLocal())}
                >
                  Use now
                </button>
              </>
            ) : (
              <DateField
                label={
                  clock.id === "ambient"
                    ? "Ambient from"
                    : clock.id === "prepped" || clock.id === "use"
                      ? "Prepped on"
                      : clock.prompt
                }
                value={raw}
                onChange={(next) => setClock(clock.id, next)}
                onToday={() => setClock(clock.id, toIsoDate(new Date()))}
              />
            )}
          </div>
        ) : null}
        {result ? (
          <div className={cn("mt-3 min-w-0", toneClass(result.tone))}>
            <WhenDate
              when={result.when}
              at={result.at}
              asHours={clock.addHours != null && clock.addHours < 24}
              className="font-display text-2xl leading-none break-words"
            />
            <span className="mt-1 block font-sans text-sm font-medium text-stone-300">
              {result.detail}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <article className="ticket-in max-w-full min-w-0 overflow-hidden rounded-2xl bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.35)] ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", SECTION_TONE[rule.sectionId])}>
          {section.short}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          {rule.category}
        </span>
        {focusKind ? (
          <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-semibold tracking-wide text-violet-100">
            {LIFE_KIND_META[focusKind].tag}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHideConfirmOpen(true)}
            aria-label={`Hide ${rule.name} from the list`}
            title="Hide from list"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/5 px-2.5 text-xs font-semibold tracking-wide text-stone-300 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
          >
            <EyeOff className="size-3.5" aria-hidden />
            Hide
          </button>
          {debugOn ? (
            <button
              type="button"
              onClick={() => setDebugOpen((open) => !open)}
              aria-pressed={debugOpen}
              aria-label={debugOpen ? "Hide item debug" : "Show item debug"}
              title="Item debug"
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                debugOpen
                  ? "bg-sky-500/25 text-sky-100 ring-sky-300/50"
                  : "bg-white/5 text-stone-300 ring-white/15 hover:bg-white/10",
              )}
            >
              <Bug className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 px-4 pt-3 pb-5">
        <h2 className="font-display text-3xl leading-tight text-white">{rule.name}</h2>
        {debugOn && debugOpen ? <ItemDebugPanel rule={rule} clocks={clocks} /> : null}
        {rule.sameAs.length > 0 ? (
          <p className="mt-2 text-sm text-stone-400">
            Same life: {rule.sameAs.join(", ")}.
          </p>
        ) : null}
        {section.note ? <p className="mt-3 text-sm text-sky-200">{section.note}</p> : null}
        <div className="mt-4 grid min-w-0 gap-3">
          {rows.map((row) => {
            if (row.length === 2) {
              return (
                <div
                  key={row.map((clock) => clock.id).join("-")}
                  className="grid min-w-0 grid-cols-1 gap-3"
                >
                  {row.map((clock) => renderClock(clock))}
                </div>
              );
            }
            return renderClock(row[0]!);
          })}
        </div>
        {advice ? (
          <p className="mt-4 rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100">
            {advice}
          </p>
        ) : null}
        {rule.note ? (
          <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-sm text-stone-200">{rule.note}</p>
        ) : null}
        {clocks.some((clock) => clock.addDays) ? (
          <p className="mt-4 text-xs text-stone-500">
            The date you enter counts as day 1 for delivery, prep, and ambient day lives. 12 days from 1 Oct is 12 Oct. Hour lives run from the time on that date.
          </p>
        ) : null}
      </div>

      <Dialog open={hideConfirmOpen} onOpenChange={setHideConfirmOpen}>
        <DialogContent className="max-w-sm border-white/10 bg-[#0f1624] text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-white">
              Hide {rule.name}?
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              It will leave the list until you show it again in Settings → Hidden.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setHideConfirmOpen(false)}
              className="h-11 flex-1 rounded-xl border border-white/10 bg-card text-sm font-semibold text-stone-200 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                hideProductName(rule.name);
                setHideConfirmOpen(false);
                onHidden?.();
              }}
              className="h-11 flex-1 rounded-xl bg-orange-500 text-sm font-semibold text-orange-950 transition-colors hover:bg-orange-400"
            >
              Hide
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function retrievedFields(rule: ShelfRule) {
  const rows: { label: string; value: string }[] = [
    { label: "id", value: rule.id },
    { label: "section", value: rule.sectionId },
    { label: "category", value: rule.category },
  ];
  const life: (keyof ShelfRule)[] = [
    "fromDelivery",
    "inUse",
    "unopened",
    "prepped",
    "ambientUse",
  ];
  for (const key of life) {
    const value = rule[key];
    if (typeof value !== "string" || !value) continue;
    rows.push({ label: key, value });
  }
  if (rule.also) {
    rows.push({
      label: `also (${rule.also.label})`,
      value: rule.also.value,
    });
  }
  if (rule.note) rows.push({ label: "note", value: rule.note });
  if (rule.aliases.length) rows.push({ label: "aliases", value: rule.aliases.join(", ") });
  if (rule.sameAs.length) rows.push({ label: "sameAs", value: rule.sameAs.join(", ") });
  return rows;
}

function ItemDebugPanel({ rule, clocks }: { rule: ShelfRule; clocks: Clock[] }) {
  const fields = retrievedFields(rule);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(true);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setCropLoading(true);

    async function loadCrop() {
      // Prefer a fresh crop from the stored PDF (new padding / scale).
      const pdf = await getSourcePdf();
      if (pdf) {
        try {
          const image = await cropOneProductRowImage(pdf, {
            id: rule.id,
            name: rule.name,
          });
          if (image) await putPdfCropImage(rule.id, image);
          if (!cancelled) {
            setCropImage(image);
            setCropLoading(false);
          }
          return;
        } catch {
          // Fall through to cache / embedded image.
        }
      }
      if (rule.pdfCropImage) {
        if (!cancelled) {
          setCropImage(rule.pdfCropImage);
          setCropLoading(false);
        }
        return;
      }
      const cached = await getPdfCropImage(rule.id);
      if (!cancelled) {
        setCropImage(cached);
        setCropLoading(false);
      }
    }

    void loadCrop();
    return () => {
      cancelled = true;
    };
  }, [rule.id, rule.name, rule.pdfCropImage]);

  useEffect(() => {
    if (!zoomOpen) setZoom(1);
  }, [zoomOpen]);

  return (
    <div className="mt-3 max-w-full min-w-0 space-y-3 overflow-hidden rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-3 text-left">
      <div className="min-w-0 overflow-hidden">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-200">
          Data retrieved
        </p>
        <dl className="mt-2 space-y-1.5 font-mono text-[0.7rem] leading-snug text-stone-200">
          {fields.map((row) => (
            <div key={row.label} className="flex min-w-0 flex-col gap-0.5 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-2">
              <dt className="shrink-0 text-stone-500">{row.label}</dt>
              <dd className="min-w-0 overflow-hidden break-all text-sky-50">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-stone-500">
          Clocks
        </p>
        <ul className="mt-1 space-y-1 font-mono text-[0.7rem] text-stone-300">
          {clocks.map((clock) => (
            <li key={clock.id} className="min-w-0 overflow-hidden break-all">
              <span className="text-stone-500">{clock.id}</span> · {clock.label}: {clock.value}
              {clock.mode !== "display" ? ` (${clock.mode})` : ""}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 overflow-hidden">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-200">
          PDF row cropped
        </p>
        {cropLoading ? (
          <p className="mt-2 text-sm text-stone-400">Loading crop…</p>
        ) : cropImage ? (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="mt-2 block w-full max-w-full overflow-hidden rounded-lg bg-black/50 ring-1 ring-white/10"
            aria-label="Enlarge PDF crop"
          >
            <img
              src={cropImage}
              alt={`PDF crop for ${rule.name}`}
              className="block h-auto max-h-56 w-full object-contain object-left"
            />
            <span className="block border-t border-white/10 px-2 py-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-sky-200/90">
              Tap to enlarge / zoom
            </span>
          </button>
        ) : (
          <p className="mt-2 text-sm text-stone-400">
            No PDF row image. Re-import the chart PDF once, then open debug again.
          </p>
        )}
        {rule.pdfCrop ? (
          <pre className="mt-2 max-h-28 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 px-2.5 py-2 font-mono text-[0.65rem] leading-relaxed text-emerald-100/90">
            {rule.pdfCrop}
          </pre>
        ) : null}
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent
          className="top-auto bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 flex h-[min(88dvh,40rem)] w-[calc(100%-1rem)] max-w-lg translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl p-0"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3 pr-14">
            <DialogTitle className="font-display text-xl text-white">
              PDF row · {rule.name}
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              Pinch or use + / − to zoom.
            </DialogDescription>
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-black/60 p-3">
            {cropImage ? (
              <img
                src={cropImage}
                alt={`Enlarged PDF crop for ${rule.name}`}
                className="mx-auto block h-auto max-w-none origin-top transition-transform duration-150"
                style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: "none" }}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.25) * 100) / 100))}
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20"
              aria-label="Zoom out"
            >
              <Minus className="size-4" />
            </button>
            <span className="min-w-14 text-center font-mono text-sm text-stone-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.25) * 100) / 100))}
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20"
              aria-label="Zoom in"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
