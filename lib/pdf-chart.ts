import { BUNDLED_PACK, parseChartPack } from "./chart-pack";
import type { ChartPack, ShelfRule } from "./types";

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

/** Commas, slashes, and "and" between names that share one life cell. */
function isGlue(gap: string) {
  return gap.length <= 24 && /^[\s,;/|&+\-]*(?:and)?[\s,;/|&+\-]*$/i.test(gap);
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

async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data }).promise;
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

  for (const base of BUNDLED_PACK.rules) {
    const needle = nameKey(base.name);
    if (needle.length < 3) continue;
    const spanIndex = takeSpan(spans, needle, spanCursor);
    if (spanIndex == null) continue;
    const window = lifeWindow(spans, spanIndex, haystack);
    const days = window.match(/(\d+)\s*days?/i);
    const hours = window.match(/(\d+)\s*hours?/i);
    const next: ShelfRule = {
      ...base,
      aliases: [...base.aliases],
      sameAs: [...base.sameAs],
      also: base.also ? { ...base.also } : undefined,
    };

    if (days && base.fromDelivery) next.fromDelivery = `${days[1]} days`;
    if (days && base.prepped && !/date on|bb date/i.test(base.prepped)) {
      next.prepped = `${days[1]} days`;
    }
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
  return {
    ok: true,
    pack: {
      chart: {
        title: campaign ? `${campaign} shelf life chart` : fileName.replace(/\.pdf$/i, ""),
        audience: /all stores/i.test(flat) ? "All stores" : BUNDLED_PACK.chart.audience,
        version: flat.match(/version\s*\d+/i)?.[0] ?? "Imported PDF",
        issued: issuedMatch ? isoFromLooseDate(issuedMatch[1]) : "",
        validUntil: validMatch ? isoFromLooseDate(validMatch[1]) : "",
      },
      sections: BUNDLED_PACK.sections.filter((section) =>
        rules.some((rule) => rule.sectionId === section.id),
      ),
      footnotes: [...BUNDLED_PACK.footnotes],
      rules,
    },
  };
}

export async function parsePdfChartBytes(
  data: Uint8Array,
  fileName: string,
): Promise<{ ok: true; pack: ChartPack } | { ok: false; error: string }> {
  try {
    const text = await extractPdfText(data);
    return packFromPdfText(text, fileName);
  } catch {
    return { ok: false, error: "Could not open that PDF." };
  }
}

export async function parsePdfChartFile(
  file: File,
): Promise<{ ok: true; pack: ChartPack } | { ok: false; error: string }> {
  return parsePdfChartBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}
