import { BUNDLED_PACK, parseChartPack } from "./chart-pack";
import { putPdfCropImage, saveSourcePdf } from "./pdf-crop-images";
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

type NameSpan = { name: string; start: number; end: number };

function findNameSpans(haystack: string): NameSpan[] {
  const names = [...new Set(BUNDLED_PACK.rules.map((rule) => rule.name))].sort(
    (a, b) => nameKey(b).length - nameKey(a).length,
  );
  const spans: NameSpan[] = [];
  const overlaps = (start: number, end: number) =>
    spans.some((span) => start < span.end && end > span.start);

  for (const name of names) {
    const key = nameKey(name);
    if (key.length < 3) continue;
    const pattern = namePattern(name);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack))) {
      const atStart = match.index === 0 && /^[a-z0-9]/.test(match[0]);
      const start = match.index + (atStart ? 0 : 1);
      const end = match.index + match[0].length;
      if (end > start && !overlaps(start, end)) {
        spans.push({ name: key, start, end });
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

/**
 * Name column then life column: "Pepperdew Pineapple Olives 25 days 10 days 10 days".
 * Those counts belong one-per-name. The last name's window would otherwise start
 * at "25 days" and give Olives Pepperdew's life.
 */
function columnDayCounts(spans: NameSpan[], haystack: string) {
  const assigned = new Map<number, string>();
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
      const counts = dayCountsIn(haystack.slice(from, Math.min(nextStart, from + 160)));
      if (counts.length === size) {
        for (let offset = 0; offset < size; offset += 1) {
          assigned.set(index + offset, counts[offset]);
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

function takeSpan(spans: NameSpan[], name: string, cursor: Map<string, number>) {
  const startAt = cursor.get(name) ?? 0;
  for (let index = startAt; index < spans.length; index += 1) {
    if (spans[index]?.name !== name) continue;
    cursor.set(name, index + 1);
    return index;
  }
  for (let index = 0; index < spans.length; index += 1) {
    if (spans[index]?.name === name) return index;
  }
  return null;
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

function lineMatchesName(line: PdfLine, name: string) {
  const needle = nameKey(name);
  if (needle.length < 3) return false;
  const hay = nameKey(line.text);
  if (!hay.includes(needle)) return false;
  // Prefer exact-ish hits so "Bacon" does not steal the "Bacon (FROZEN)" row.
  if (needle === "bacon" && /\bbacon frozen\b/.test(hay)) return false;
  return true;
}

function dayField(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d+)\s*days?\b/i);
  return match ? match[1] : null;
}

/**
 * Map day counts from the PDF window onto delivery / in-use / prepped.
 * Bacon (FROZEN) prints 10 days delivery + 7 days in use — a single "7 days"
 * after the name must not overwrite delivery.
 */
function applyParsedDayCounts(
  next: ShelfRule,
  base: ShelfRule,
  window: string,
  columnDay: string | undefined,
) {
  const days = dayCountsIn(window);
  const deliveryN = dayField(base.fromDelivery);
  const useN = dayField(base.inUse);
  const preppedN =
    base.prepped && !/date on|bb date/i.test(base.prepped) ? dayField(base.prepped) : null;

  if (deliveryN && useN) {
    if (days.length >= 2) {
      next.fromDelivery = `${days[0]} days`;
      next.inUse = `${days[1]} days`;
      return;
    }
    const only = days[0] ?? columnDay;
    if (!only) return;
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
  products: { id: string; name: string }[],
): Promise<Record<string, string>> {
  if (typeof document === "undefined") return {};
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
  const scale = 2.5;
  const crops: Record<string, string> = {};
  const usedLineKeys = new Set<string>();
  // Longer names first so "Bacon (FROZEN)" claims its row before "Bacon".
  const ordered = [...products].sort(
    (a, b) => nameKey(b.name).length - nameKey(a.name).length,
  );

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = (await doc.getPage(pageNumber)) as unknown as PdfjsPage;
    const content = await page.getTextContent();
    const lines = clusterPdfLines(pageNumber - 1, content.items);
    const productLines = lines.filter((line) =>
      ordered.some((product) => lineMatchesName(line, product.name)),
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
        return lineMatchesName(item, product.name);
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
  product: { id: string; name: string },
): Promise<string | null> {
  const crops = await cropProductRowsFromPdf(data, [product]);
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
    const line = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");
    chunks.push(line);
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

  const flat = text.replace(/\s+/g, " ").trim();
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
  const spanCursor = new Map<string, number>();
  const columnDays = columnDayCounts(spans, haystack);

  for (const base of BUNDLED_PACK.rules) {
    const needle = nameKey(base.name);
    if (needle.length < 3) continue;
    const spanIndex = takeSpan(spans, needle, spanCursor);
    if (spanIndex == null) continue;
    const window = lifeWindow(spans, spanIndex, haystack);
    const hours = window.match(/(\d+)\s*hours?/i);
    const next: ShelfRule = {
      ...base,
      aliases: [...base.aliases],
      sameAs: [...base.sameAs],
      also: base.also ? { ...base.also } : undefined,
      pdfCrop: rowCrop(spans, spanIndex, haystack),
    };

    applyParsedDayCounts(next, base, window, columnDays.get(spanIndex));
    if (hours && base.inUse && /hour/i.test(base.inUse)) {
      next.inUse = `${hours[1]} hours prepped`;
    }
    if (hours && base.ambientUse && /hour/i.test(base.ambientUse)) {
      next.ambientUse = `${hours[1]} hours`;
    }
    if (hours && base.also && /hour/i.test(base.also.value)) {
      next.also = { ...base.also, value: `${hours[1]} hours` };
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
        parsed.pack.rules.map((rule) => ({ id: rule.id, name: rule.name })),
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
