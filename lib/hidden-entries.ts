import { CHART_PRODUCT_RENAMES, canonicalProductName } from "./chart-name-migrate";
import { SECTION_TAG } from "./preview";
import type { SectionId } from "./types";

const SECTIONS = new Set<SectionId>(["frozen", "chilled", "ready", "ambient", "pack"]);

/** One hidden product, optionally limited to a single storage. */
export type HiddenEntry = {
  name: string;
  /** null = every storage for this product. */
  section: SectionId | null;
};

function isSection(value: unknown): value is SectionId {
  return typeof value === "string" && SECTIONS.has(value as SectionId);
}

export function hiddenEntryKey(entry: HiddenEntry): string {
  return entry.section ? `${entry.name}|${entry.section}` : entry.name;
}

export function formatHiddenLabel(entry: HiddenEntry): string {
  return entry.section ? `${entry.name} · ${SECTION_TAG[entry.section]}` : entry.name;
}

export function sameHiddenEntry(a: HiddenEntry, b: HiddenEntry): boolean {
  return a.name === b.name && a.section === b.section;
}

function sortEntries(entries: HiddenEntry[]): HiddenEntry[] {
  return [...entries].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    if (a.section === b.section) return 0;
    if (a.section == null) return -1;
    if (b.section == null) return 1;
    return a.section.localeCompare(b.section);
  });
}

function dedupeEntries(entries: HiddenEntry[]): HiddenEntry[] {
  const byName = new Map<string, HiddenEntry[]>();
  for (const entry of entries) {
    const list = byName.get(entry.name) ?? [];
    list.push(entry);
    byName.set(entry.name, list);
  }
  const out: HiddenEntry[] = [];
  for (const [name, list] of byName) {
    if (list.some((item) => item.section == null)) {
      out.push({ name, section: null });
      continue;
    }
    const sections = new Set(list.map((item) => item.section).filter(Boolean) as SectionId[]);
    for (const section of [...sections].sort((a, b) => a.localeCompare(b))) {
      out.push({ name, section });
    }
  }
  return sortEntries(out);
}

/** Turn stored JSON (legacy names or objects) into clean hidden entries. */
export function parseHiddenEntries(value: unknown): HiddenEntry[] {
  if (!Array.isArray(value)) return [];
  const parsed: HiddenEntry[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const rename = CHART_PRODUCT_RENAMES[trimmed];
      if (rename) {
        parsed.push({
          name: rename.name,
          section: rename.sectionId ?? null,
        });
        continue;
      }
      // Bacon|frozen style keys from an older encode attempt.
      const pipe = trimmed.indexOf("|");
      if (pipe > 0) {
        const name = canonicalProductName(trimmed.slice(0, pipe));
        const sectionRaw = trimmed.slice(pipe + 1);
        if (name && isSection(sectionRaw)) {
          parsed.push({ name, section: sectionRaw });
          continue;
        }
      }
      const name = canonicalProductName(trimmed);
      if (name) parsed.push({ name, section: null });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const nameRaw = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!nameRaw) continue;
    const rename = CHART_PRODUCT_RENAMES[nameRaw];
    const name = rename?.name ?? canonicalProductName(nameRaw);
    if (!name) continue;
    const section =
      rename?.sectionId ?? (isSection(raw.section) ? raw.section : null);
    parsed.push({ name, section });
  }
  return dedupeEntries(parsed);
}

/** JSON shape written to localStorage / campaign library. */
export function serializeHiddenEntries(entries: HiddenEntry[]): unknown[] {
  return parseHiddenEntries(entries).map((entry) =>
    entry.section == null ? entry.name : { name: entry.name, section: entry.section },
  );
}

export function isSectionHidden(
  entries: Iterable<HiddenEntry>,
  name: string,
  section: SectionId,
): boolean {
  const trimmed = canonicalProductName(name);
  if (!trimmed) return false;
  for (const entry of entries) {
    if (entry.name !== trimmed) continue;
    if (entry.section == null || entry.section === section) return true;
  }
  return false;
}

/** True when every listed storage is hidden (or the product is hidden as a whole). */
export function isProductHidden(
  entries: Iterable<HiddenEntry>,
  name: string,
  sections: Iterable<SectionId>,
): boolean {
  const trimmed = canonicalProductName(name);
  if (!trimmed) return false;
  const list = [...sections];
  if (list.length === 0) {
    return [...entries].some((entry) => entry.name === trimmed);
  }
  return list.every((section) => isSectionHidden(entries, trimmed, section));
}

export function hiddenNamesFromEntries(entries: Iterable<HiddenEntry>): string[] {
  return [...new Set([...entries].map((entry) => entry.name))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function addHiddenEntry(
  entries: HiddenEntry[],
  name: string,
  section: SectionId | null = null,
): HiddenEntry[] {
  const trimmed = canonicalProductName(name);
  if (!trimmed) return parseHiddenEntries(entries);
  return dedupeEntries([...entries, { name: trimmed, section }]);
}

export function removeHiddenEntry(
  entries: HiddenEntry[],
  name: string,
  section: SectionId | null | undefined = undefined,
): HiddenEntry[] {
  const trimmed = canonicalProductName(name);
  if (!trimmed) return parseHiddenEntries(entries);
  if (section === undefined) {
    return entries.filter((entry) => entry.name !== trimmed);
  }
  return dedupeEntries(
    entries.filter(
      (entry) => !(entry.name === trimmed && entry.section === section),
    ),
  );
}

export function removeHiddenByKey(entries: HiddenEntry[], key: string): HiddenEntry[] {
  const trimmed = key.trim();
  if (!trimmed) return parseHiddenEntries(entries);
  return entries.filter((entry) => hiddenEntryKey(entry) !== trimmed);
}
