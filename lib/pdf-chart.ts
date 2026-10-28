import { BUNDLED_PACK, parseChartPack } from "./chart-pack";
import { putPdfCropImage, saveSourcePdf } from "./pdf-crop-images";
import { splitPreppedAmbientFields } from "./storage-life";
import type { ChartPack, ShelfRule } from "./types";

function pdfWorkerSrc() {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${base}/pdf.worker.min.mjs`;
  }
  return `${base}/pdf.worker.min.mjs`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word key that ignores punctuation, so "Bacon (FROZEN)" matches "bacon frozen". */
function nameKey(name: string) {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(" ");
}

function namePattern(name: string) {
  const parts = nameKey(name).split(" ").map(escapeRegExp);
  return new RegExp(`(?:^|[^a-z0-9])${parts.join("[^a-z0-9]+")}(?![a-z0-9])`, "gi");
}

type NameSpan = {
  /** Display product key, e.g. "bacon". */
  name: string;
  /** Text that matched, e.g. "bacon frozen" from the chart label. */
  matched: string;
  start: number;
  end: number;
};

type MatchLabel = { display: string; label: string };

function matchLabelsForRules(): MatchLabel[] {
  const labels: MatchLabel[] = [];
  const seen = new Set<string>();
  for (const rule of BUNDLED_PACK.rules) {
    const display = nameKey(rule.name);
    if (display.length < 3) continue;
    for (const label of [rule.name, ...rule.aliases]) {
      const key = nameKey(label);
      if (key.length < 3) continue;
      const id = `${display}::${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      labels.push({ display, label });
    }
  }
  // Longer chart labels first so "Bacon (FROZEN)" wins over "Bacon".
  return labels.sort((a, b) => nameKey(b.label).length - nameKey(a.label).length);
}

function findNameSpans(haystack: string): NameSpan[] {
  const spans: NameSpan[] = [];
  const overlaps = (start: number, end: number) =>
    spans.some((span) => start < span.end && end > span.start);

  for (const { display, label } of matchLabelsForRules()) {
    const matched = nameKey(label);
    const pattern = namePattern(label);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack))) {
      const atStart = match.index === 0 && /^[a-z0-9]/.test(match[0]);
      const start = match.index + (atStart ? 0 : 1);
      const end = match.index + match[0].length;
      if (end > start && !overlaps(start, end)) {
        spans.push({ name: display, matched, start, end });
      }
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
    }
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  return spans;
}

/**
 * Separators between names that share one life cell: `/`, `,`, `&`, `+`, `-`, or "and".
 * A plain space is the next row. Treating that space as glue joined a whole name
 * column, so Pepperdew's 25 days was copied onto Pineapple and Olives.
 */
function isGlue(gap: string) {
  const trimmed = gap.trim();
  if (!trimmed || trimmed.length > 24) return false;
  return /^(?:and|&|\/|,|\+|-)+$/i.test(trimmed.replace(/\s+/g, ""));
}

function isWhitespaceGap(gap: string) {
  return gap.length > 0 && gap.length <= 24 && /^\s+$/.test(gap);
}

function dayCountsIn(text: string) {
  return [...text.matchAll(/(\d+)\s*days?/gi)].map((match) => match[1]);
}

function hourCountsIn(text: string) {
  return [...text.matchAll(/(\d+)\s*hours?/gi)].map((match) => match[1]);
}

type ColumnLife = { days?: string; hours?: string };

/**
 * Name column then life column: "Pepperdew Pineapple Olives 25 days 10 days 10 days"
 * or "Garlic Butter Pizza Sauce 12 hours 15 hours".
 * Those counts belong one-per-name. The last name's window would otherwise start
 * at the first count and steal the earlier product's life.
 */
function columnLifeCounts(spans: NameSpan[], haystack: string) {
  const assigned = new Map<number, ColumnLife>();
  let index = 0;
  while (index < spans.length) {
    let end = index;
    while (
      end + 1 < spans.length &&
      isWhitespaceGap(haystack.slice(spans[end].end, spans[end + 1].start))
    ) {
      end += 1;
    }
    const size = end - index + 1;
    if (size >= 2) {
      const from = spans[end].end;
      const nextStart = end + 1 < spans.length ? spans[end + 1].start : haystack.length;
      const slice = haystack.slice(from, Math.min(nextStart, from + 160));
      const days = dayCountsIn(slice);
      const hours = hourCountsIn(slice);
      if (days.length === size) {
        for (let offset = 0; offset < size; offset += 1) {
          assigned.set(index + offset, { days: days[offset] });
        }
      } else if (hours.length === size) {
        for (let offset = 0; offset < size; offset += 1) {
          assigned.set(index + offset, { hours: hours[offset] });
        }
      }
    }
    index = end + 1;
  }
  return assigned;
}

/**
 * Day and hour counts are read after the product name, up to the next product.
 * Names in one cell (Pineapple / Olives) share the count that follows the group.
 * Counting from before the name steals the previous row — Pepperdew's 25 days
 * was being applied to Pineapple and Olives, which are 10.
 */
function lifeWindow(spans: NameSpan[], index: number, haystack: string) {
  let groupEnd = index;
  while (
    groupEnd + 1 < spans.length &&
    isGlue(haystack.slice(spans[groupEnd].end, spans[groupEnd + 1].start))
  ) {
    groupEnd += 1;
  }
  const from = spans[groupEnd].end;
  const nextStart = groupEnd + 1 < spans.length ? spans[groupEnd + 1].start : haystack.length;
  return haystack.slice(from, Math.min(nextStart, from + 160));
}

/** Product name through the life cells the parser read for that row. */
function rowCrop(spans: NameSpan[], index: number, haystack: string) {
  let groupEnd = index;
  while (
    groupEnd + 1 < spans.length &&
    isGlue(haystack.slice(spans[groupEnd].end, spans[groupEnd + 1].start))
  ) {
    groupEnd += 1;
  }
  const from = spans[groupEnd].end;
  const nextStart = groupEnd + 1 < spans.length ? spans[groupEnd + 1].start : haystack.length;
  const end = Math.min(nextStart, from + 160);
  return haystack.slice(spans[index]!.start, end).trim();
}

const AMBIENT_LEAD =
  /^(?:[\s,;:/]|n\/a)*((?:\d+)\s*hours?\s*ambient|ambient\s*[:\s]*(?:\d+)\s*hours?)/i;
const CHILLED_LEAD =
  /^(?:[\s,;:/]|n\/a)*((?:\d+)\s*hours?\s*chilled|chilled\s*[:\s]*(?:\d+)\s*hours?)/i;

function ruleForSpanName(name: string): ShelfRule | undefined {
  return BUNDLED_PACK.rules.find((rule) => nameKey(rule.name) === name);
}

function wantsHourAmbient(rule: ShelfRule | undefined) {
  return Boolean(rule?.ambientUse && /hour/i.test(rule.ambientUse) && !/n\/a/i.test(rule.ambientUse));
}

function wantsChilledHour(rule: ShelfRule | undefined) {
  return Boolean(rule?.prepped && /hour/i.test(rule.prepped) && /chilled/i.test(rule.prepped));
}

function takeLeadingMatch(window: string, pattern: RegExp): { token: string; rest: string } | null {
  const match = window.match(pattern);
  if (!match?.[1]) return null;
  return { token: match[1], rest: `${window.slice(0, match.index ?? 0)}${window.slice((match.index ?? 0) + match[0].length)}` };
}

/**
 * When a chilled/ambient cell is split across columns/rows, the next product name
 * can land between the two halves. Move leading companion hours back to the owner
 * and strip them from the following product's window.
 */
function resolveSplitLifeWindows(spans: NameSpan[], haystack: string): string[] {
  const windows = spans.map((_, index) => lifeWindow(spans, index, haystack));
  for (let index = 0; index < spans.length; index += 1) {
    const owner = ruleForSpanName(spans[index]!.name);
    if (!owner) continue;
    const wordingChilled = /\bchilled\b/i.test(windows[index]!);
    const wordingAmbient = /\bambient\b/i.test(windows[index]!);
    const needAmbient = wantsHourAmbient(owner) && !wordingAmbient;
    const needChilled = wantsChilledHour(owner) && !wordingChilled;
    if (!needAmbient && !needChilled) continue;

    let groupEnd = index;
    while (
      groupEnd + 1 < spans.length &&
      isGlue(haystack.slice(spans[groupEnd]!.end, spans[groupEnd + 1]!.start))
    ) {
      groupEnd += 1;
    }
    const nextIndex = groupEnd + 1;
    if (nextIndex >= spans.length) continue;
    const nextOwner = ruleForSpanName(spans[nextIndex]!.name);
    let nextWindow = windows[nextIndex]!;

    if (needAmbient && !wantsHourAmbient(nextOwner)) {
      const taken = takeLeadingMatch(nextWindow, AMBIENT_LEAD);
      if (taken) {
        windows[index] = `${windows[index]} ${taken.token}`;
        nextWindow = taken.rest;
      }
    }
    if (needChilled && !wantsChilledHour(nextOwner)) {
      const taken = takeLeadingMatch(nextWindow, CHILLED_LEAD);
      if (taken) {
        windows[index] = `${windows[index]} ${taken.token}`;
        nextWindow = taken.rest;
      }
    }
    windows[nextIndex] = nextWindow;
  }
  return windows;
}

/**
 * Life-only continuation lines (wrapped / spanned cells) join the previous product
 * row before the flat haystack is built.
 */
function mergeContinuationLines(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return text;
  const merged: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasName = findNameSpans(lower).length > 0;
    const looksLife = /(\d+\s*(?:hours?|days?)|\bchilled\b|\bambient\b|\bn\/a\b|date on)/i.test(
      line,
    );
    if (!hasName && looksLife && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
    } else {
      merged.push(line);
    }
  }
  return merged.join("\n");
}

function spanScoreForRule(span: NameSpan, rule: ShelfRule): number {
  const display = nameKey(rule.name);
  if (span.name !== display) return -1;
  const aliasKeys = new Set(rule.aliases.map(nameKey));
  if (aliasKeys.has(span.matched)) return 100 + span.matched.length;
  if (span.matched === display) return 50;
  return -1;
}

function takeSpanForRule(
  spans: NameSpan[],
  rule: ShelfRule,
  used: Set<number>,
): number | null {
  let best: { index: number; score: number } | null = null;
  for (let index = 0; index < spans.length; index += 1) {
    if (used.has(index)) continue;
    const score = spanScoreForRule(spans[index]!, rule);
    if (score < 0) continue;
    if (!best || score > best.score || (score === best.score && index < best.index)) {
      best = { index, score };
    }
  }
  if (!best) return null;
  used.add(best.index);
  return best.index;
}

function isoFromLooseDate(raw: string): string {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const months: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const named = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!named) return "";
  const month = months[named[2].toLowerCase()];
  if (!month) return "";
  return `${named[3]}-${month}-${named[1].padStart(2, "0")}`;
}

type PdfLine = {
  pageIndex: number;
  /** PDF user-space baseline (higher = higher on page). */
  y: number;
  height: number;
  text: string;
};

type PdfjsPage = {
  getViewport: (params: { scale: number }) => {
    width: number;
    height: number;
    convertToViewportPoint: (x: number, y: number) => [number, number];
  };
  getTextContent: () => Promise<{
    items: Array<{ str?: string; width?: number; height?: number; transform?: number[] }>;
  }>;
  render: (params: {
    canvas: HTMLCanvasElement | null;
    canvasContext?: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<unknown> };
};

function clusterPdfLines(
  pageIndex: number,
  items: Array<{ str?: string; width?: number; height?: number; transform?: number[] }>,
): PdfLine[] {
  const rows: { y: number; items: typeof items }[] = [];
  for (const item of items) {
    const str = item.str?.trim();
    const transform = item.transform;
    if (!str || !transform || transform.length < 6) continue;
    const y = transform[5]!;
    const existing = rows.find((row) => Math.abs(row.y - y) < 3.5);
    if (existing) existing.items.push(item);
    else rows.push({ y, items: [item] });
  }

  return rows
    .map((row) => {
      const sorted = [...row.items].sort(
        (a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0),
      );
      const height = Math.max(
        8,
        ...sorted.map((item) => {
          const t = item.transform!;
          return Math.hypot(t[2] ?? 0, t[3] ?? 0) || item.height || 8;
        }),
      );
      return {
        pageIndex,
        y: row.y,
        height,
        text: sorted.map((item) => item.str ?? "").join(" "),
      };
    })
    .sort((a, b) => b.y - a.y);
}

function lineMatchesRule(line: PdfLine, rule: { name: string; aliases: string[] }) {
  const hay = nameKey(line.text);
  const labels = [rule.name, ...rule.aliases].map(nameKey).filter((key) => key.length >= 3);
  if (labels.length === 0) return false;
  // Prefer the longest label that appears on the line.
  const hit = labels.sort((a, b) => b.length - a.length).find((key) => hay.includes(key));
  return Boolean(hit);
}

function dayField(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d+)\s*days?\b/i);
  return match ? match[1] : null;
}

/**
 * Map day counts from the PDF window onto delivery / in-use / prepped.
 * Only fields that exist on the chart row are updated — never invent a second
 * life column. A single day count that spans From delivery + In use (Pepperoni)
 * updates both when those bundled lives match. Bacon prints 10 + 7; a lone
 * "7 days" after the name must not overwrite delivery.
 */
function applyParsedDayCounts(
  next: ShelfRule,
  base: ShelfRule,
  window: string,
  columnLife: ColumnLife | undefined,
) {
  const days = dayCountsIn(window);
  const deliveryN = dayField(base.fromDelivery);
  const useN = dayField(base.inUse);
  const preppedN =
    base.prepped && !/date on|bb date/i.test(base.prepped) ? dayField(base.prepped) : null;
  const columnDay = columnLife?.days;

  if (deliveryN && useN) {
    if (days.length >= 2) {
      next.fromDelivery = `${days[0]} days`;
      next.inUse = `${days[1]} days`;
      return;
    }
    const only = days[0] ?? columnDay;
    if (!only) return;
    // Spanned one-cell covering both columns (same day life on the chart).
    if (deliveryN === useN) {
      next.fromDelivery = `${only} days`;
      next.inUse = `${only} days`;
      return;
    }
    if (only === useN && only !== deliveryN) {
      next.inUse = `${only} days`;
      return;
    }
    if (only === deliveryN && only !== useN) {
      next.fromDelivery = `${only} days`;
      return;
    }
    if (columnDay && columnDay === deliveryN) {
      next.fromDelivery = `${columnDay} days`;
    }
    return;
  }

  const dayCount = columnDay ?? days[0];
  if (dayCount && deliveryN) next.fromDelivery = `${dayCount} days`;
  if (dayCount && preppedN) next.prepped = `${dayCount} days`;
}

function applyParsedHourCounts(
  next: ShelfRule,
  base: ShelfRule,
  window: string,
  columnLife: ColumnLife | undefined,
) {
  // Chilled/ambient wording owns the hour fields when present.
  if (/\bchilled\b|\bambient\b/i.test(window)) return;
  const hour = columnLife?.hours ?? hourCountsIn(window)[0];
  if (!hour) return;
  if (base.inUse && /hour/i.test(base.inUse)) next.inUse = `${hour} hours prepped`;
  if (base.ambientUse && /hour/i.test(base.ambientUse)) next.ambientUse = `${hour} hours`;
  if (base.also && /hour/i.test(base.also.value)) {
    next.also = { ...base.also, value: `${hour} hours` };
  }
}

async function renderPageCanvas(page: PdfjsPage, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // pdf.js v5 wants `canvas` (canvasContext alone can fail silently).
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { canvas, viewport };
}

function cropStrip(
  pageCanvas: HTMLCanvasElement,
  viewport: {
    width: number;
    height: number;
    convertToViewportPoint: (x: number, y: number) => [number, number];
  },
  pageWidth: number,
  yHigh: number,
  yLow: number,
  /** Extra viewport pixels above/below the row. */
  padPx = 18,
) {
  const top = viewport.convertToViewportPoint(0, yHigh);
  const bottom = viewport.convertToViewportPoint(pageWidth, yLow);
  const sy = Math.max(0, Math.min(top[1], bottom[1]) - padPx);
  const sh = Math.min(
    pageCanvas.height - sy,
    Math.abs(bottom[1] - top[1]) + padPx * 2,
  );
  if (sh < 4) return null;
  const strip = document.createElement("canvas");
  strip.width = pageCanvas.width;
  strip.height = Math.max(1, Math.ceil(sh));
  const ctx = strip.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(pageCanvas, 0, sy, pageCanvas.width, sh, 0, 0, strip.width, strip.height);
  return strip.toDataURL("image/jpeg", 0.85);
}

/**
 * Full-width JPEG strips for each product row, using PDF text positions.
 * Browser-only (needs canvas). Returns empty map when canvas is unavailable.
 */
async function cropProductRowsFromPdf(
  data: Uint8Array,
  products: { id: string; name: string; aliases: string[] }[],
): Promise<Record<string, string>> {
  if (typeof document === "undefined") return {};
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
  const scale = 2.5;
  const crops: Record<string, string> = {};
  const usedLineKeys = new Set<string>();
  // Longer labels first so "Bacon (FROZEN)" claims its row before plain "Bacon".
  const ordered = [...products].sort((a, b) => {
    const aLen = Math.max(nameKey(a.name).length, ...a.aliases.map((alias) => nameKey(alias).length));
    const bLen = Math.max(nameKey(b.name).length, ...b.aliases.map((alias) => nameKey(alias).length));
    return bLen - aLen;
  });

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = (await doc.getPage(pageNumber)) as unknown as PdfjsPage;
    const content = await page.getTextContent();
    const lines = clusterPdfLines(pageNumber - 1, content.items);
    const productLines = lines.filter((line) =>
      ordered.some((product) => lineMatchesRule(line, product)),
    );
    if (productLines.length === 0) continue;

    const rendered = await renderPageCanvas(page, scale);
    if (!rendered) continue;
    const pageWidth = page.getViewport({ scale: 1 }).width;

    for (const product of ordered) {
      if (crops[product.id]) continue;
      const line = productLines.find((item) => {
        const key = `${item.pageIndex}:${item.y}`;
        if (usedLineKeys.has(key)) return false;
        return lineMatchesRule(item, product);
      });
      if (!line) continue;
      usedLineKeys.add(`${line.pageIndex}:${line.y}`);

      const lineIndex = productLines.indexOf(line);
      const next = productLines[lineIndex + 1];
      // Leave clear space above/below the product row in the crop.
      const pad = Math.max(line.height * 0.9, 10);
      const yHigh = line.y + line.height * 0.55 + pad;
      let yLow = next
        ? next.y + next.height * 0.25 - pad * 0.35
        : line.y - Math.max(line.height * 2.6, 16) - pad;
      const maxSpan = Math.max(line.height * 5.2, 36) + pad * 2;
      if (yHigh - yLow > maxSpan) yLow = yHigh - maxSpan;

      const dataUrl = cropStrip(
        rendered.canvas,
        rendered.viewport,
        pageWidth,
        yHigh,
        yLow,
        Math.round(14 * scale),
      );
      if (dataUrl) crops[product.id] = dataUrl;
    }
  }

  return crops;
}

/** Build one product row JPEG from PDF bytes (used on import and on-demand in debug). */
export async function cropOneProductRowImage(
  data: Uint8Array,
  product: { id: string; name: string; aliases?: string[] },
): Promise<string | null> {
  const crops = await cropProductRowsFromPdf(data, [
    { id: product.id, name: product.name, aliases: product.aliases ?? [] },
  ]);
  return crops[product.id] ?? null;
}

async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items as Array<{
      str?: string;
      width?: number;
      height?: number;
      transform?: number[];
    }>;
    // Join left-to-right within a row band, then keep bands on separate lines so
    // wrapped / spanned life cells can merge onto the product row above.
    const lines = clusterPdfLines(pageNumber - 1, items);
    if (lines.length > 0) {
      chunks.push(lines.map((line) => line.text).join("\n"));
      continue;
    }
    const fallback = items
      .map((item) => item.str ?? "")
      .filter(Boolean)
      .join(" ");
    if (fallback) chunks.push(fallback);
  }
  return chunks.join("\n");
}

export function packFromPdfText(text: string, fileName: string): { ok: true; pack: ChartPack } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return parseChartPack(JSON.parse(trimmed));
    } catch {
      // Continue with text parsing.
    }
  }

  const banded = mergeContinuationLines(text);
  const flat = banded.replace(/\s+/g, " ").trim();
  if (flat.length < 40) {
    return { ok: false, error: "Could not read text from that PDF." };
  }

  const validMatch =
    flat.match(/valid\s*(?:until|to)\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|\d{4}-\d{2}-\d{2})/i) ??
    flat.match(/until\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
  const issuedMatch =
    flat.match(/issued\s*(?:on\s*)?([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|\d{4}-\d{2}-\d{2})/i) ??
    flat.match(/([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}).{0,40}valid/i);

  const rules: ShelfRule[] = [];
  const used = new Set<string>();
  const haystack = flat.toLowerCase();
  const spans = findNameSpans(haystack);
  const usedSpans = new Set<number>();
  const columnLives = columnLifeCounts(spans, haystack);
  const lifeWindows = resolveSplitLifeWindows(spans, haystack);

  for (const base of BUNDLED_PACK.rules) {
    const needle = nameKey(base.name);
    if (needle.length < 3) continue;
    const spanIndex = takeSpanForRule(spans, base, usedSpans);
    if (spanIndex == null) continue;
    const window = lifeWindows[spanIndex] ?? lifeWindow(spans, spanIndex, haystack);
    const columnLife = columnLives.get(spanIndex);
    const next: ShelfRule = {
      ...base,
      aliases: [...base.aliases],
      sameAs: [...base.sameAs],
      also: base.also ? { ...base.also } : undefined,
      pdfCrop: rowCrop(spans, spanIndex, haystack),
    };

    applyParsedDayCounts(next, base, window, columnLife);

    // Divided prepped cells: "chilled" → prepped (chilled), "ambient" → ambientUse.
    if (/\bchilled\b|\bambient\b/i.test(window)) {
      const split = splitPreppedAmbientFields(base.prepped, base.ambientUse, window);
      if (split.prepped) next.prepped = split.prepped;
      if (split.ambientUse) next.ambientUse = split.ambientUse;
    } else {
      applyParsedHourCounts(next, base, window, columnLife);
    }

    if (!used.has(next.id)) {
      used.add(next.id);
      rules.push(next);
    }
  }

  if (rules.length === 0) {
    return {
      ok: false,
      error: "No shelf-life products were recognised in that PDF. Try the Campaign chart sheet.",
    };
  }

  const campaign = flat.match(/campaign\s*\d+/i)?.[0];
  const versionMatch = flat.match(/version\s*\d+/i)?.[0];
  const issued = issuedMatch ? isoFromLooseDate(issuedMatch[1]) : "";
  const validUntil = validMatch ? isoFromLooseDate(validMatch[1]) : "";
  return {
    ok: true,
    pack: {
      chart: {
        // Keep Campaign meta when the PDF text scrape misses a field.
        title: campaign
          ? `${campaign} shelf life chart`
          : BUNDLED_PACK.chart.title || fileName.replace(/\.pdf$/i, ""),
        audience: /all stores/i.test(flat) ? "All stores" : BUNDLED_PACK.chart.audience,
        version: versionMatch ?? BUNDLED_PACK.chart.version,
        issued: issued || BUNDLED_PACK.chart.issued,
        validUntil: validUntil || BUNDLED_PACK.chart.validUntil,
      },
      sections: BUNDLED_PACK.sections.filter((section) =>
        rules.some((rule) => rule.sectionId === section.id),
      ),
      footnotes: [...BUNDLED_PACK.footnotes],
      rules,
    },
  };
}

export type PdfChartResult =
  | { ok: true; pack: ChartPack; crops: Record<string, string> }
  | { ok: false; error: string };

export async function parsePdfChartBytes(
  data: Uint8Array,
  fileName: string,
): Promise<PdfChartResult> {
  try {
    await saveSourcePdf(data);
    const text = await extractPdfText(data);
    const parsed = packFromPdfText(text, fileName);
    if (!parsed.ok) return parsed;
    let crops: Record<string, string> = {};
    try {
      crops = await cropProductRowsFromPdf(
        data,
        parsed.pack.rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          aliases: rule.aliases,
        })),
      );
    } catch {
      crops = {};
    }
    const rules = parsed.pack.rules.map((rule) =>
      crops[rule.id] ? { ...rule, pdfCropImage: crops[rule.id] } : rule,
    );
    return { ok: true, pack: { ...parsed.pack, rules }, crops };
  } catch {
    return { ok: false, error: "Could not open that PDF." };
  }
}

export async function parsePdfChartFile(file: File): Promise<PdfChartResult> {
  return parsePdfChartBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}
