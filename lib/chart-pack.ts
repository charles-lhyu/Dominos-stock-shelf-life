import { CHART, FOOTNOTES, RULES, SECTIONS } from "./chart";
import type { ChartPack, ChartSection, SectionId, ShelfAlso, ShelfRule } from "./types";

const SECTION_IDS: SectionId[] = ["frozen", "chilled", "ready", "ambient", "pack"];

export const BUNDLED_PACK: ChartPack = {
  chart: { ...CHART },
  sections: SECTIONS.map((section) => ({ ...section })),
  footnotes: [...FOOTNOTES],
  rules: RULES.map((rule) => ({ ...rule, aliases: [...rule.aliases], sameAs: [...rule.sameAs] })),
};

/** App starts empty — chart data only appears after import. */
export const EMPTY_PACK: ChartPack = {
  chart: {
    title: "Domino's Stock Shelf Life",
    audience: "",
    version: "",
    issued: "",
    validUntil: "",
  },
  sections: [],
  footnotes: [],
  rules: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseAlso(value: unknown): ShelfAlso | undefined {
  if (!isRecord(value)) return undefined;
  const label = asString(value.label);
  const text = asString(value.value);
  if (!label || !text) return undefined;
  return { label, value: text };
}

function parseRule(value: unknown, index: number): ShelfRule | string {
  if (!isRecord(value)) return `Rule ${index + 1} is not an object.`;
  const sectionId = asString(value.sectionId) as SectionId | null;
  if (!sectionId || !SECTION_IDS.includes(sectionId)) {
    return `Rule ${index + 1} needs a valid sectionId.`;
  }
  const category = asString(value.category);
  const name = asString(value.name);
  if (!category || !name) return `Rule ${index + 1} needs category and name.`;
  const id = asString(value.id) ?? `${sectionId}:${index + 1}`;
  return {
    id,
    sectionId,
    category,
    name,
    aliases: asStringArray(value.aliases),
    sameAs: asStringArray(value.sameAs),
    fromDelivery: asString(value.fromDelivery) ?? undefined,
    inUse: asString(value.inUse) ?? undefined,
    unopened: asString(value.unopened) ?? undefined,
    prepped: asString(value.prepped) ?? undefined,
    ambientUse: asString(value.ambientUse) ?? undefined,
    also: parseAlso(value.also),
    note: asString(value.note) ?? undefined,
    pdfCrop: asString(value.pdfCrop) ?? undefined,
  };
}

function parseSection(value: unknown, index: number): ChartSection | string {
  if (!isRecord(value)) return `Section ${index + 1} is not an object.`;
  const id = asString(value.id) as SectionId | null;
  if (!id || !SECTION_IDS.includes(id)) return `Section ${index + 1} needs a valid id.`;
  const title = asString(value.title);
  const short = asString(value.short) ?? title;
  if (!title) return `Section ${index + 1} needs a title.`;
  return {
    id,
    title,
    short: short ?? title,
    note: asString(value.note) ?? "",
  };
}

export function parseChartPack(raw: unknown): { ok: true; pack: ChartPack } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Chart data must be a JSON object." };

  const chartRaw = isRecord(raw.chart) ? raw.chart : raw;
  const title = asString(chartRaw.title) ?? "Imported shelf life chart";
  const audience = asString(chartRaw.audience) ?? "All stores";
  const version = asString(chartRaw.version) ?? "Imported";
  const issued = asString(chartRaw.issued) ?? asString(chartRaw.issuedOn) ?? "";
  const validUntil = asString(chartRaw.validUntil) ?? asString(chartRaw.valid_until) ?? "";

  const rulesRaw = raw.rules ?? raw.products;
  if (!Array.isArray(rulesRaw) || rulesRaw.length === 0) {
    return { ok: false, error: "Chart JSON needs a non-empty rules array." };
  }

  const rules: ShelfRule[] = [];
  for (let index = 0; index < rulesRaw.length; index += 1) {
    const parsed = parseRule(rulesRaw[index], index);
    if (typeof parsed === "string") return { ok: false, error: parsed };
    rules.push(parsed);
  }

  let sections: ChartSection[];
  if (Array.isArray(raw.sections) && raw.sections.length > 0) {
    sections = [];
    for (let index = 0; index < raw.sections.length; index += 1) {
      const parsed = parseSection(raw.sections[index], index);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      sections.push(parsed);
    }
  } else {
    const used = new Set(rules.map((rule) => rule.sectionId));
    sections = BUNDLED_PACK.sections.filter((section) => used.has(section.id));
  }

  return {
    ok: true,
    pack: {
      chart: { title, audience, version, issued, validUntil },
      sections,
      footnotes: asStringArray(raw.footnotes),
      rules,
    },
  };
}

export function sectionFromPack(pack: ChartPack, id: SectionId): ChartSection {
  const section = pack.sections.find((item) => item.id === id);
  if (section) return section;
  const fallback = BUNDLED_PACK.sections.find((item) => item.id === id);
  if (fallback) return fallback;
  return { id, title: id, short: id, note: "" };
}
