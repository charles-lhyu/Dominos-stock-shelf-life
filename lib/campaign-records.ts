import {
  formatHiddenLabel,
  hiddenEntryKey,
  parseHiddenEntries,
  type HiddenEntry,
} from "./hidden-entries";
import {
  DEFAULT_ITEM_PRESET,
  normalizeItemPreset,
  retainProductDefaults,
  sameItemPreset,
  type ItemPreset,
} from "./item-preset-store";
import type { ChartPack, SectionId, ShelfRule } from "./types";

const SECTIONS = new Set<SectionId>(["frozen", "chilled", "ready", "ambient", "pack"]);

function isSection(value: unknown): value is SectionId {
  return typeof value === "string" && SECTIONS.has(value as SectionId);
}

/** Store-level display settings (shared across that store's campaign presets). */
export type StoreSettings = {
  name: string;
  /** Short DD/MM/YY dates instead of the long form. */
  compactDates: boolean;
  /** Day and hour counts instead of use-by dates. */
  showDayCounts: boolean;
  /** Product list without storage and life tags. */
  compactList: boolean;
};

/** One campaign preset saved under a store. */
export type CampaignPreset = {
  title: string;
  issued: string;
  validUntil: string;
  version: string;
  hidden: HiddenEntry[];
  preset: ItemPreset;
};

export type StoreRecord = {
  settings: StoreSettings;
  campaigns: Record<string /* issued|validUntil */, CampaignPreset>;
};

/**
 * Flat screen snapshot used by live sync / store-switch prompts.
 * Dates and list come from the store; hidden and product defaults from the campaign preset.
 */
export type StoreCampaignSettings = {
  hidden: HiddenEntry[];
  preset: ItemPreset;
  compactDates?: boolean;
  showDayCounts?: boolean;
  compactList?: boolean;
};

export type CampaignRecord = {
  issued: string;
  validUntil: string;
  title: string;
  version: string;
  sourceUrl: string;
  savedAt: string;
  pack: ChartPack;
};

export type CampaignSummary = {
  issued: string;
  validUntil: string;
  title: string;
  version: string;
  sourceUrl: string;
  savedAt: string;
};

export type CampaignLibrary = {
  /** Shared chart packs on this device (images stripped). */
  campaigns: CampaignRecord[];
  stores: Record<string /* storeId */, StoreRecord>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  name: "",
  compactDates: false,
  showDayCounts: false,
  compactList: false,
};

export function emptyCampaignLibrary(): CampaignLibrary {
  return { campaigns: [], stores: {} };
}

const STORE_NAME_LIMIT = 48;

/** Trim a store display name. Blank clears it. */
export function normalizeStoreName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, STORE_NAME_LIMIT);
}

function emptyStoreRecord(): StoreRecord {
  return { settings: { ...DEFAULT_STORE_SETTINGS }, campaigns: {} };
}

function sameStoreSettings(a: StoreSettings, b: StoreSettings): boolean {
  return (
    a.name === b.name &&
    a.compactDates === b.compactDates &&
    a.showDayCounts === b.showDayCounts &&
    a.compactList === b.compactList
  );
}

export function readStoreName(library: CampaignLibrary, storeId: string): string {
  if (!/^\d{1,8}$/.test(storeId)) return "";
  return library.stores[storeId]?.settings.name ?? "";
}

export function writeStoreName(
  library: CampaignLibrary,
  storeId: string,
  name: string,
): CampaignLibrary {
  if (!/^\d{1,8}$/.test(storeId)) return library;
  const next = normalizeStoreName(name);
  const store = library.stores[storeId] ?? emptyStoreRecord();
  if (store.settings.name === next) return library;
  return {
    ...library,
    stores: {
      ...library.stores,
      [storeId]: {
        ...store,
        settings: { ...store.settings, name: next },
      },
    },
  };
}

export function readStoreSettingsRecord(
  library: CampaignLibrary,
  storeId: string,
): StoreSettings | null {
  if (!/^\d{1,8}$/.test(storeId)) return null;
  const store = library.stores[storeId];
  if (!store) return null;
  return { ...store.settings };
}

export function writeStoreSettingsRecord(
  library: CampaignLibrary,
  storeId: string,
  settings: StoreSettings,
): CampaignLibrary {
  if (!/^\d{1,8}$/.test(storeId)) return library;
  const store = library.stores[storeId] ?? emptyStoreRecord();
  const next: StoreSettings = {
    name: normalizeStoreName(settings.name),
    compactDates: settings.compactDates === true,
    showDayCounts: settings.showDayCounts === true,
    compactList: settings.compactList === true,
  };
  if (sameStoreSettings(store.settings, next)) return library;
  return {
    ...library,
    stores: {
      ...library.stores,
      [storeId]: { ...store, settings: next },
    },
  };
}

/** Campaign identity is the issued date plus the valid-until date. */
export function campaignKey(issued: string, validUntil: string): string | null {
  if (!ISO_DATE.test(issued) || !ISO_DATE.test(validUntil)) return null;
  return `${issued}|${validUntil}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function stripPackImages(pack: ChartPack): ChartPack {
  return {
    ...pack,
    rules: pack.rules.map(({ pdfCropImage: _image, ...rule }) => rule),
  };
}

function sameHidden(a: HiddenEntry[], b: HiddenEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => hiddenEntryKey(item) === hiddenEntryKey(b[index]!))
  );
}

function parsePack(value: unknown): ChartPack | null {
  if (!isRecord(value) || !isRecord(value.chart)) return null;
  const issued = typeof value.chart.issued === "string" ? value.chart.issued : "";
  const validUntil = typeof value.chart.validUntil === "string" ? value.chart.validUntil : "";
  if (!campaignKey(issued, validUntil)) return null;
  const rules = Array.isArray(value.rules) ? value.rules : [];
  return stripPackImages({
    chart: {
      title: typeof value.chart.title === "string" ? value.chart.title : "",
      audience: typeof value.chart.audience === "string" ? value.chart.audience : "",
      version: typeof value.chart.version === "string" ? value.chart.version : "",
      issued,
      validUntil,
    },
    sections: (Array.isArray(value.sections) ? value.sections : []) as ChartPack["sections"],
    footnotes: Array.isArray(value.footnotes)
      ? value.footnotes.filter((item): item is string => typeof item === "string")
      : [],
    rules: rules.filter((rule): rule is ShelfRule => isRecord(rule) && typeof rule.name === "string"),
  });
}

function dateDisplayFlags(value: {
  compactDates?: unknown;
  showDayCounts?: unknown;
  compactList?: unknown;
}) {
  return {
    compactDates: value.compactDates === true,
    showDayCounts: value.showDayCounts === true,
    compactList: value.compactList === true,
  };
}

function parseLegacyFlatSettings(value: unknown): StoreCampaignSettings | null {
  if (!isRecord(value)) return null;
  // New store record has settings + campaigns — not a flat settings blob.
  if (isRecord(value.settings) || isRecord(value.campaigns)) return null;
  return {
    hidden: parseHiddenEntries(value.hidden),
    preset: normalizeItemPreset(value.preset),
    ...dateDisplayFlags(value),
  };
}

function parseStoreSettings(value: unknown, fallbackName = ""): StoreSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_STORE_SETTINGS, name: normalizeStoreName(fallbackName) };
  }
  return {
    name: normalizeStoreName(
      typeof value.name === "string" ? value.name : fallbackName,
    ),
    ...dateDisplayFlags(value),
  };
}

function parseCampaignPreset(
  value: unknown,
  key: string,
  chart: CampaignRecord | undefined,
): CampaignPreset | null {
  if (!isRecord(value)) return null;
  const [issued = "", validUntil = ""] = key.split("|");
  if (campaignKey(issued, validUntil) !== key) return null;
  return {
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : chart?.title || "Shelf life chart",
    issued,
    validUntil,
    version:
      typeof value.version === "string" && value.version.trim()
        ? value.version.trim()
        : chart?.version || "",
    hidden: parseHiddenEntries(value.hidden),
    preset: normalizeItemPreset(value.preset),
  };
}

function isNewStoreRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (isRecord(value.settings) || isRecord(value.campaigns));
}

export function parseCampaignLibrary(value: unknown): CampaignLibrary {
  if (!isRecord(value)) return emptyCampaignLibrary();
  const byKey = new Map<string, CampaignRecord>();
  const chartSource = Array.isArray(value.campaigns)
    ? value.campaigns
    : Array.isArray(value.charts)
      ? value.charts
      : [];
  for (const item of chartSource) {
    if (!isRecord(item)) continue;
    const pack = parsePack(item.pack);
    if (!pack) continue;
    const key = campaignKey(pack.chart.issued, pack.chart.validUntil);
    if (!key) continue;
    byKey.set(key, {
      issued: pack.chart.issued,
      validUntil: pack.chart.validUntil,
      title: typeof item.title === "string" ? item.title : pack.chart.title,
      version: typeof item.version === "string" ? item.version : pack.chart.version,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
      savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
      pack,
    });
  }

  const legacyNames: Record<string, string> = {};
  if (isRecord(value.storeNames)) {
    for (const [storeId, name] of Object.entries(value.storeNames)) {
      if (typeof name !== "string") continue;
      const next = normalizeStoreName(name);
      if (/^\d{1,8}$/.test(storeId) && next) legacyNames[storeId] = next;
    }
  }

  const stores: CampaignLibrary["stores"] = {};
  if (isRecord(value.stores)) {
    for (const [storeId, rawStore] of Object.entries(value.stores)) {
      if (!/^\d{1,8}$/.test(storeId) || !isRecord(rawStore)) continue;

      if (isNewStoreRecord(rawStore)) {
        const settings = parseStoreSettings(rawStore.settings, legacyNames[storeId] ?? "");
        const campaigns: Record<string, CampaignPreset> = {};
        if (isRecord(rawStore.campaigns)) {
          for (const [key, rawPreset] of Object.entries(rawStore.campaigns)) {
            const preset = parseCampaignPreset(rawPreset, key, byKey.get(key));
            if (preset) campaigns[key] = preset;
          }
        }
        // Keep every store record, including empty name / no campaigns yet
        // (display settings may be the only thing saved).
        stores[storeId] = { settings, campaigns };
        continue;
      }

      // Legacy: stores[id][issued|validUntil] = flat settings
      const campaigns: Record<string, CampaignPreset> = {};
      let lifted: StoreSettings | null = null;
      for (const [key, rawSettings] of Object.entries(rawStore)) {
        const flat = parseLegacyFlatSettings(rawSettings);
        if (!flat) continue;
        const preset = parseCampaignPreset(
          {
            hidden: flat.hidden,
            preset: flat.preset,
          },
          key,
          byKey.get(key),
        );
        if (!preset) continue;
        campaigns[key] = preset;
        if (!lifted) {
          lifted = {
            name: legacyNames[storeId] ?? "",
            compactDates: flat.compactDates === true,
            showDayCounts: flat.showDayCounts === true,
            compactList: flat.compactList === true,
          };
        }
      }
      if (Object.keys(campaigns).length > 0 || legacyNames[storeId]) {
        stores[storeId] = {
          settings: lifted ?? {
            ...DEFAULT_STORE_SETTINGS,
            name: legacyNames[storeId] ?? "",
          },
          campaigns,
        };
      }
    }
  }

  // Legacy storeNames with no campaigns yet still become store records.
  for (const [storeId, name] of Object.entries(legacyNames)) {
    if (stores[storeId]) continue;
    stores[storeId] = {
      settings: { ...DEFAULT_STORE_SETTINGS, name },
      campaigns: {},
    };
  }

  return { campaigns: [...byKey.values()], stores };
}

export function upsertCampaign(
  library: CampaignLibrary,
  pack: ChartPack,
  sourceUrl: string,
  savedAt: string,
): CampaignLibrary {
  const key = campaignKey(pack.chart.issued, pack.chart.validUntil);
  if (!key) return library;
  const stored = stripPackImages(pack);
  const existing = library.campaigns.find(
    (item) => campaignKey(item.issued, item.validUntil) === key,
  );
  if (
    existing &&
    existing.sourceUrl === sourceUrl &&
    JSON.stringify(existing.pack) === JSON.stringify(stored)
  ) {
    return library;
  }
  const record: CampaignRecord = {
    issued: stored.chart.issued,
    validUntil: stored.chart.validUntil,
    title: stored.chart.title,
    version: stored.chart.version,
    sourceUrl,
    savedAt,
    pack: stored,
  };
  return {
    ...library,
    campaigns: [
      ...library.campaigns.filter((item) => campaignKey(item.issued, item.validUntil) !== key),
      record,
    ],
    stores: library.stores,
  };
}

function flattenStoreCampaign(
  store: StoreRecord,
  preset: CampaignPreset,
): StoreCampaignSettings {
  return {
    hidden: preset.hidden,
    preset: preset.preset,
    compactDates: store.settings.compactDates,
    showDayCounts: store.settings.showDayCounts,
    compactList: store.settings.compactList,
  };
}

export function readStoreSettings(
  library: CampaignLibrary,
  storeId: string,
  issued: string,
  validUntil: string,
): StoreCampaignSettings | null {
  const key = campaignKey(issued, validUntil);
  if (!storeId || !key) return null;
  const store = library.stores[storeId];
  const preset = store?.campaigns[key];
  if (!store || !preset) return null;
  return flattenStoreCampaign(store, preset);
}

export function writeStoreSettings(
  library: CampaignLibrary,
  storeId: string,
  issued: string,
  validUntil: string,
  settings: StoreCampaignSettings,
): CampaignLibrary {
  const key = campaignKey(issued, validUntil);
  if (!storeId || !key) return library;
  const chart = library.campaigns.find(
    (item) => campaignKey(item.issued, item.validUntil) === key,
  );
  const store = library.stores[storeId] ?? emptyStoreRecord();
  const prevPreset = store.campaigns[key];
  const nextPreset: CampaignPreset = {
    title: prevPreset?.title || chart?.title || "Shelf life chart",
    issued,
    validUntil,
    version: prevPreset?.version || chart?.version || "",
    hidden: parseHiddenEntries(settings.hidden),
    preset: normalizeItemPreset(settings.preset),
  };
  const nextSettings: StoreSettings = {
    name: store.settings.name,
    compactDates: settings.compactDates === true,
    showDayCounts: settings.showDayCounts === true,
    compactList: settings.compactList === true,
  };
  if (
    prevPreset &&
    sameHidden(prevPreset.hidden, nextPreset.hidden) &&
    sameItemPreset(prevPreset.preset, nextPreset.preset) &&
    prevPreset.title === nextPreset.title &&
    prevPreset.version === nextPreset.version &&
    sameStoreSettings(store.settings, nextSettings)
  ) {
    return library;
  }
  return {
    ...library,
    stores: {
      ...library.stores,
      [storeId]: {
        settings: nextSettings,
        campaigns: {
          ...store.campaigns,
          [key]: nextPreset,
        },
      },
    },
  };
}

export function dropStoredHidden(
  settings: StoreCampaignSettings,
  nameOrKey: string,
): StoreCampaignSettings {
  const trimmed = nameOrKey.trim();
  if (!trimmed) return settings;
  const next = settings.hidden.filter(
    (item) => item.name !== trimmed && hiddenEntryKey(item) !== trimmed,
  );
  if (next.length === settings.hidden.length) return settings;
  return { ...settings, hidden: next };
}

export function dropStoredDefault(
  settings: StoreCampaignSettings,
  name: string,
): StoreCampaignSettings {
  const trimmed = name.trim();
  if (!trimmed || !settings.preset.defaults[trimmed]) return settings;
  const defaults = { ...settings.preset.defaults };
  delete defaults[trimmed];
  return { ...settings, preset: { ...settings.preset, defaults } };
}

/** Set or replace one product's storage default in saved campaign settings. */
export function setStoredDefault(
  settings: StoreCampaignSettings,
  name: string,
  section: SectionId,
): StoreCampaignSettings {
  const trimmed = name.trim();
  if (!trimmed || !isSection(section)) return settings;
  const current = settings.preset.defaults[trimmed];
  if (current?.section === section && current.life == null) return settings;
  const defaults = { ...settings.preset.defaults };
  defaults[trimmed] = { section, life: null };
  return { ...settings, preset: { ...settings.preset, defaults } };
}

export function dropAllStoredHidden(settings: StoreCampaignSettings): StoreCampaignSettings {
  if (settings.hidden.length === 0) return settings;
  return { ...settings, hidden: [] };
}

export function dropAllStoredDefaults(settings: StoreCampaignSettings): StoreCampaignSettings {
  if (Object.keys(settings.preset.defaults).length === 0) return settings;
  return { ...settings, preset: { ...settings.preset, defaults: {} } };
}

const EMPTY_SETTINGS: StoreCampaignSettings = {
  hidden: [],
  preset: DEFAULT_ITEM_PRESET,
  compactDates: false,
  showDayCounts: false,
  compactList: false,
};

/**
 * Keep the previous store's copy when the id changes.
 * Without `keepCurrent`, a store that already has this campaign is restored,
 * and a store with nothing yet keeps the settings currently on screen.
 * `keepCurrent: true` writes the screen onto the new store.
 * `keepCurrent: false` loads that store's saved copy, or clears the screen when it has none.
 * `nextSettings` writes that copy onto the new store and restores it, leaving the previous store with the screen.
 */
export function planStoreChange(input: {
  library: CampaignLibrary;
  previousStoreId: string;
  nextStoreId: string;
  issued: string;
  validUntil: string;
  current: StoreCampaignSettings;
  keepCurrent?: boolean;
  /** Settings to write on the new store after the previous store is saved. */
  nextSettings?: StoreCampaignSettings;
}): { library: CampaignLibrary; restore: StoreCampaignSettings | null } {
  const key = campaignKey(input.issued, input.validUntil);
  if (!key) return { library: input.library, restore: null };
  let library = input.library;
  if (input.previousStoreId && input.previousStoreId !== input.nextStoreId) {
    library = writeStoreSettings(
      library,
      input.previousStoreId,
      input.issued,
      input.validUntil,
      input.current,
    );
  }
  if (!input.nextStoreId) return { library, restore: null };
  if (input.nextSettings && input.previousStoreId !== input.nextStoreId) {
    library = writeStoreSettings(
      library,
      input.nextStoreId,
      input.issued,
      input.validUntil,
      input.nextSettings,
    );
    return { library, restore: input.nextSettings };
  }
  if (input.previousStoreId !== input.nextStoreId && input.keepCurrent === false) {
    const existing = readStoreSettings(
      library,
      input.nextStoreId,
      input.issued,
      input.validUntil,
    );
    return { library, restore: existing ?? EMPTY_SETTINGS };
  }
  if (input.previousStoreId !== input.nextStoreId && input.keepCurrent !== true) {
    const existing = readStoreSettings(
      library,
      input.nextStoreId,
      input.issued,
      input.validUntil,
    );
    if (existing) return { library, restore: existing };
  }
  library = writeStoreSettings(
    library,
    input.nextStoreId,
    input.issued,
    input.validUntil,
    input.current,
  );
  return { library, restore: null };
}

export type StoreSettingChange = {
  id: string;
  group: "Dates" | "Hidden" | "Defaults";
  label: string;
  from: string;
  to: string;
};

function defaultChoice(value: { section: string | null; life: string | null } | undefined) {
  if (!value?.section) return "None";
  if (value.section === "frozen") return "Frozen";
  if (value.section === "chilled") return "Chilled";
  if (value.section === "pack") return "On pack";
  if (value.section === "ready" || value.section === "ambient") return "Ambient";
  return "None";
}

function sameDefault(
  a: { section: string | null; life: string | null } | undefined,
  b: { section: string | null; life: string | null } | undefined,
) {
  return (a?.section ?? null) === (b?.section ?? null);
}

/** Differences between the screen and the store being loaded. Accepting a change takes the saved side. */
export function listStoreSettingChanges(
  current: StoreCampaignSettings,
  saved: StoreCampaignSettings | null,
): StoreSettingChange[] {
  const target = saved ?? EMPTY_SETTINGS;
  const changes: StoreSettingChange[] = [];
  if ((current.showDayCounts === true) !== (target.showDayCounts === true)) {
    changes.push({
      id: "dates:days",
      group: "Dates",
      label: "Day counts",
      from: current.showDayCounts ? "On" : "Off",
      to: target.showDayCounts ? "On" : "Off",
    });
  }
  if ((current.compactDates === true) !== (target.compactDates === true)) {
    changes.push({
      id: "dates:compact",
      group: "Dates",
      label: "Date display",
      from: current.compactDates ? "Short" : "Full",
      to: target.compactDates ? "Short" : "Full",
    });
  }
  const hiddenKeys = new Set([
    ...current.hidden.map(hiddenEntryKey),
    ...target.hidden.map(hiddenEntryKey),
  ]);
  const currentHidden = new Map(current.hidden.map((item) => [hiddenEntryKey(item), item]));
  const savedHidden = new Map(target.hidden.map((item) => [hiddenEntryKey(item), item]));
  for (const key of [...hiddenKeys].sort((a, b) => a.localeCompare(b))) {
    const onScreen = currentHidden.has(key);
    const onSaved = savedHidden.has(key);
    if (onScreen === onSaved) continue;
    const entry = currentHidden.get(key) ?? savedHidden.get(key)!;
    changes.push({
      id: `hidden:${key}`,
      group: "Hidden",
      label: formatHiddenLabel(entry),
      from: onScreen ? "Hidden" : "Shown",
      to: onSaved ? "Hidden" : "Shown",
    });
  }
  const defaults = new Set([
    ...Object.keys(current.preset.defaults),
    ...Object.keys(target.preset.defaults),
  ]);
  for (const name of [...defaults].sort((a, b) => a.localeCompare(b))) {
    const from = current.preset.defaults[name];
    const to = target.preset.defaults[name];
    if (sameDefault(from, to)) continue;
    changes.push({
      id: `default:${name}`,
      group: "Defaults",
      label: name,
      from: defaultChoice(from),
      to: defaultChoice(to),
    });
  }
  return changes;
}

/** Screen settings, with each accepted change replaced by the saved store's value. */
export function applyAcceptedStoreChanges(
  current: StoreCampaignSettings,
  saved: StoreCampaignSettings | null,
  acceptedIds: Iterable<string>,
): StoreCampaignSettings {
  const target = saved ?? EMPTY_SETTINGS;
  const accepted = new Set(acceptedIds);
  const hidden = new Map(current.hidden.map((item) => [hiddenEntryKey(item), item]));
  for (const entry of [...current.hidden, ...target.hidden]) {
    const key = hiddenEntryKey(entry);
    if (!accepted.has(`hidden:${key}`)) continue;
    if (target.hidden.some((item) => hiddenEntryKey(item) === key)) {
      hidden.set(key, entry);
    } else {
      hidden.delete(key);
    }
  }
  const defaults = { ...current.preset.defaults };
  for (const name of new Set([
    ...Object.keys(current.preset.defaults),
    ...Object.keys(target.preset.defaults),
  ])) {
    if (!accepted.has(`default:${name}`)) continue;
    const next = target.preset.defaults[name];
    if (next) defaults[name] = { section: next.section, life: next.life };
    else delete defaults[name];
  }
  return {
    hidden: parseHiddenEntries([...hidden.values()]),
    preset: { ...current.preset, defaults },
    compactDates: accepted.has("dates:compact")
      ? target.compactDates === true
      : current.compactDates === true,
    showDayCounts: accepted.has("dates:days")
      ? target.showDayCounts === true
      : current.showDayCounts === true,
    // Compact list is a session view; keep whichever side is current on screen.
    compactList: current.compactList === true,
  };
}

export type StoreCampaignView = {
  issued: string;
  validUntil: string;
  title: string;
  version: string;
  hidden: HiddenEntry[];
  preset: ItemPreset;
  compactDates: boolean;
  showDayCounts: boolean;
  compactList: boolean;
  /** Chart storage rows for this campaign — used to edit defaults in Settings. */
  rules: ShelfRule[];
};

/** Campaign presets this store has saved, one row per campaign. */
export function listStoreCampaigns(library: CampaignLibrary, storeId: string): StoreCampaignView[] {
  if (!storeId) return [];
  const store = library.stores[storeId];
  if (!store) return [];
  const charts = new Map(
    library.campaigns.map((item) => [campaignKey(item.issued, item.validUntil), item]),
  );
  const rows: StoreCampaignView[] = [];
  for (const [key, preset] of Object.entries(store.campaigns)) {
    if (campaignKey(preset.issued, preset.validUntil) !== key) continue;
    const chart = charts.get(key);
    const rules = chart?.pack.rules ?? [];
    rows.push({
      issued: preset.issued,
      validUntil: preset.validUntil,
      title: preset.title || chart?.title || "Shelf life chart",
      version: preset.version || chart?.version || "",
      hidden: preset.hidden,
      compactDates: store.settings.compactDates,
      showDayCounts: store.settings.showDayCounts,
      compactList: store.settings.compactList,
      rules,
      preset: {
        ...preset.preset,
        defaults: retainProductDefaults(preset.preset.defaults, rules, preset.hidden),
      },
    });
  }
  rows.sort((a, b) => {
    if (a.validUntil !== b.validUntil) return a.validUntil < b.validUntil ? 1 : -1;
    if (a.issued !== b.issued) return a.issued < b.issued ? 1 : -1;
    return a.title < b.title ? 1 : -1;
  });
  return rows;
}

export type DeviceStoredRecord = StoreCampaignView & { storeId: string };

/** Every store's saved campaign settings on this device, store id then newest campaign. */
export function listDeviceStored(library: CampaignLibrary): DeviceStoredRecord[] {
  return Object.keys(library.stores)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .flatMap((storeId) =>
      listStoreCampaigns(library, storeId).map((row) => ({ storeId, ...row })),
    );
}

/** One store's display settings for the All stored list. */
export type DeviceStoreSettingsView = StoreSettings & {
  storeId: string;
  campaignCount: number;
};

/** Every store record on this device, with settings and campaign count. */
export function listDeviceStoreSettings(
  library: CampaignLibrary,
): DeviceStoreSettingsView[] {
  return Object.keys(library.stores)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((storeId) => {
      const store = library.stores[storeId]!;
      return {
        storeId,
        name: store.settings.name,
        compactDates: store.settings.compactDates,
        showDayCounts: store.settings.showDayCounts,
        compactList: store.settings.compactList,
        campaignCount: Object.keys(store.campaigns).length,
      };
    });
}

export function listCampaignSummaries(library: CampaignLibrary): CampaignSummary[] {
  return [...library.campaigns]
    .sort((a, b) => {
      if (a.validUntil !== b.validUntil) return a.validUntil < b.validUntil ? 1 : -1;
      if (a.issued !== b.issued) return a.issued < b.issued ? 1 : -1;
      return a.savedAt < b.savedAt ? 1 : -1;
    })
    .map((item) => ({
      issued: item.issued,
      validUntil: item.validUntil,
      title: item.title,
      version: item.version,
      sourceUrl: item.sourceUrl,
      savedAt: item.savedAt,
    }));
}
