import {
  DEFAULT_ITEM_PRESET,
  normalizeItemPreset,
  retainProductDefaults,
  sameItemPreset,
  type ItemPreset,
} from "./item-preset-store";
import type { ChartPack, ShelfRule } from "./types";

/** Hidden items and item-type preset for one store on one campaign. */
export type StoreCampaignSettings = {
  hidden: string[];
  preset: ItemPreset;
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
  campaigns: CampaignRecord[];
  stores: Record<string, Record<string, StoreCampaignSettings>>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyCampaignLibrary(): CampaignLibrary {
  return { campaigns: [], stores: {} };
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

function hiddenNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item !== ""),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function sameHidden(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
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

function parseSettings(value: unknown): StoreCampaignSettings | null {
  if (!isRecord(value)) return null;
  return {
    hidden: hiddenNames(value.hidden),
    preset: normalizeItemPreset(value.preset),
  };
}

export function parseCampaignLibrary(value: unknown): CampaignLibrary {
  if (!isRecord(value)) return emptyCampaignLibrary();
  const byKey = new Map<string, CampaignRecord>();
  if (Array.isArray(value.campaigns)) {
    for (const item of value.campaigns) {
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
  }
  const stores: CampaignLibrary["stores"] = {};
  if (isRecord(value.stores)) {
    for (const [storeId, byCampaign] of Object.entries(value.stores)) {
      if (!/^\d{1,8}$/.test(storeId) || !isRecord(byCampaign)) continue;
      const next: Record<string, StoreCampaignSettings> = {};
      for (const [key, settings] of Object.entries(byCampaign)) {
        const parsed = parseSettings(settings);
        const [issued = "", validUntil = ""] = key.split("|");
        if (!parsed || campaignKey(issued, validUntil) !== key) continue;
        next[key] = parsed;
      }
      if (Object.keys(next).length > 0) stores[storeId] = next;
    }
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
    campaigns: [
      ...library.campaigns.filter((item) => campaignKey(item.issued, item.validUntil) !== key),
      record,
    ],
    stores: library.stores,
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
  return library.stores[storeId]?.[key] ?? null;
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
  const nextSettings: StoreCampaignSettings = {
    hidden: hiddenNames(settings.hidden),
    preset: normalizeItemPreset(settings.preset),
  };
  const prev = library.stores[storeId]?.[key];
  if (
    prev &&
    sameHidden(prev.hidden, nextSettings.hidden) &&
    sameItemPreset(prev.preset, nextSettings.preset)
  ) {
    return library;
  }
  return {
    campaigns: library.campaigns,
    stores: {
      ...library.stores,
      [storeId]: {
        ...(library.stores[storeId] ?? {}),
        [key]: nextSettings,
      },
    },
  };
}

export function dropStoredHidden(
  settings: StoreCampaignSettings,
  name: string,
): StoreCampaignSettings {
  const trimmed = name.trim();
  if (!trimmed || !settings.hidden.includes(trimmed)) return settings;
  return { ...settings, hidden: settings.hidden.filter((item) => item !== trimmed) };
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

const EMPTY_SETTINGS: StoreCampaignSettings = {
  hidden: [],
  preset: DEFAULT_ITEM_PRESET,
};

/**
 * Keep the previous store's copy when the id changes.
 * Without `keepCurrent`, a store that already has this campaign is restored,
 * and a store with nothing yet keeps the settings currently on screen.
 * `keepCurrent: true` writes the screen onto the new store.
 * `keepCurrent: false` loads that store's saved copy, or clears the screen when it has none.
 */
export function planStoreChange(input: {
  library: CampaignLibrary;
  previousStoreId: string;
  nextStoreId: string;
  issued: string;
  validUntil: string;
  current: StoreCampaignSettings;
  keepCurrent?: boolean;
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

export type StoreCampaignView = {
  issued: string;
  validUntil: string;
  title: string;
  hidden: string[];
  preset: ItemPreset;
};

/** Settings this store has saved, one row per campaign. */
export function listStoreCampaigns(library: CampaignLibrary, storeId: string): StoreCampaignView[] {
  if (!storeId) return [];
  const saved = library.stores[storeId];
  if (!saved) return [];
  const campaigns = new Map(
    library.campaigns.map((item) => [campaignKey(item.issued, item.validUntil), item]),
  );
  const rows: StoreCampaignView[] = [];
  for (const [key, settings] of Object.entries(saved)) {
    const [issued = "", validUntil = ""] = key.split("|");
    if (campaignKey(issued, validUntil) !== key) continue;
    const campaign = campaigns.get(key);
    rows.push({
      issued,
      validUntil,
      title: campaign?.title || "Shelf life chart",
      hidden: settings.hidden,
      preset: {
        ...settings.preset,
        defaults: retainProductDefaults(
          settings.preset.defaults,
          campaign?.pack.rules ?? [],
          settings.hidden,
        ),
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
