import {
  campaignKey,
  emptyCampaignLibrary,
  listCampaignSummaries,
  listDeviceStored,
  listDeviceStoreSettings,
  listStoreCampaigns,
  dropAllStoredDefaults,
  dropAllStoredHidden,
  dropCampaign,
  dropStoreCampaignPreset,
  dropStoredDefault,
  dropStoredHidden,
  setStoredDefault,
  parseCampaignLibrary,
  planStoreChange,
  readStoreSettings,
  upsertCampaign,
  applyStoreCopyFrom,
  copyStoreData,
  writeStoreName,
  writeStoreSettings,
  writeStoreSettingsRecord,
  type CampaignLibrary,
  type CampaignSummary,
  type DeviceStoredRecord,
  type DeviceStoreSettingsView,
  type StoreCampaignSettings,
  type StoreCampaignView,
  type StoreCopySelection,
  type StoreSettings,
} from "./campaign-records";
import { mergeStoresIntoLibrary, pickStoresFromLibrary } from "./stored-library-io";
import {
  getDeskState,
  onPackCleared,
  onPackImported,
  setImportedPack,
} from "./desk-store";
import {
  clearHiddenNames,
  getHiddenEntries,
  getHiddenNames,
  replaceHiddenNames,
  subscribeHidden,
} from "./hidden-store";
import {
  getItemPreset,
  replaceItemPreset,
  resetItemPreset,
  retainProductDefaults,
  subscribeItemPreset,
  type ItemPreset,
} from "./item-preset-store";
import {
  getCompactDateFormat,
  setCompactDateFormat,
  subscribeDateFormat,
} from "./date-format-store";
import { getCompactList, setCompactList, subscribeCompactList } from "./compact-list-store";
import { readDebugDays, subscribeDebug, writeDebugDays } from "./debug-store";
import { getStoreId, hydrateStoreIdStore, subscribeStoreId } from "./store-id-store";
import type { ChartPack, SectionId, ShelfRule } from "./types";

const STORAGE_KEY = "campaign-library-v1";
const EMPTY_CAMPAIGNS: CampaignSummary[] = [];
const EMPTY_STORED: StoreCampaignView[] = [];
const EMPTY_DEVICE: DeviceStoredRecord[] = [];
const EMPTY_STORE_SETTINGS: DeviceStoreSettingsView[] = [];
const EMPTY_STORE_NAMES: Record<string, string> = {};
let storeNameSnapshot: Record<string, string> = EMPTY_STORE_NAMES;
let storeSettingsSnapshot: DeviceStoreSettingsView[] = EMPTY_STORE_SETTINGS;

let library: CampaignLibrary = emptyCampaignLibrary();
let snapshot: CampaignSummary[] = EMPTY_CAMPAIGNS;
let deviceSnapshot: DeviceStoredRecord[] = EMPTY_DEVICE;
let storedCache = new Map<string, StoreCampaignView[]>();
let hydrated = false;
let applying = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function refreshSnapshot() {
  const next = listCampaignSummaries(library);
  snapshot = next.length === 0 ? EMPTY_CAMPAIGNS : next;
  const device = listDeviceStored(library);
  deviceSnapshot = device.length === 0 ? EMPTY_DEVICE : device;
  const storeSettings = listDeviceStoreSettings(library);
  storeSettingsSnapshot =
    storeSettings.length === 0 ? EMPTY_STORE_SETTINGS : storeSettings;
  storedCache = new Map();
  const names: Record<string, string> = {};
  for (const [storeId, store] of Object.entries(library.stores)) {
    if (store.settings.name) names[storeId] = store.settings.name;
  }
  storeNameSnapshot = Object.keys(names).length === 0 ? EMPTY_STORE_NAMES : names;
}

function commitLibrary(next: CampaignLibrary) {
  if (next === library) return;
  library = next;
  refreshSnapshot();
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    }
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}

export function hydrateCampaignLibrary() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  let hadRaw = false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      hadRaw = true;
      library = parseCampaignLibrary(JSON.parse(raw));
    }
  } catch {
    library = emptyCampaignLibrary();
    hadRaw = true;
  }
  // Always rebuild list snapshots. commitLibrary(library) is a no-op when the
  // parsed object was just assigned to `library` (same reference), which left
  // Show all / Store ID empty until something was edited.
  refreshSnapshot();
  if (hadRaw) {
    // Rewrite once so legacy flat stores land as store-first on disk.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch {
      // Ignore quota / private mode.
    }
  }
}

/** Snapshot of the device Stored data library (charts + store presets). */
export function getCampaignLibrary(): CampaignLibrary {
  hydrateCampaignLibrary();
  return library;
}

/**
 * Activate the newest imported campaign (by validUntil). Preferring the desk
 * key when the file also had a newer campaign left Settings/desk on the old
 * chart after import.
 */
export function pickActivateCampaignKey(
  importedKeys: Iterable<string>,
  _deskKey?: string | null,
): string | null {
  const keys = [
    ...new Set([...importedKeys].map((key) => key.trim()).filter(Boolean)),
  ];
  if (keys.length === 0) return null;
  keys.sort((a, b) => {
    const aUntil = a.split("|")[1] ?? "";
    const bUntil = b.split("|")[1] ?? "";
    if (aUntil !== bUntil) return aUntil < bUntil ? 1 : -1;
    return a < b ? 1 : -1;
  });
  return keys[0] ?? null;
}

/**
 * Put an imported chart pack onto the desk so the main list matches the library.
 * Without this, Stored data import only updated campaign-library-v1 while
 * shelf-life-desk-v1 kept showing the previous pack.
 */
function activateImportedCampaigns(importedKeys: Iterable<string>) {
  const desk = getDeskState();
  const deskKey = desk.imported
    ? campaignKey(desk.pack.chart.issued, desk.pack.chart.validUntil)
    : null;
  const activate = pickActivateCampaignKey(importedKeys, deskKey);
  if (!activate) return;
  const [issued, validUntil] = activate.split("|");
  if (!issued || !validUntil) return;
  reloadCampaign(issued, validUntil);
}

/**
 * Replace the whole Stored data library (import). Activates an imported chart
 * on the desk so the UI does not keep showing the previous pack.
 */
export function replaceCampaignLibrary(next: CampaignLibrary) {
  hydrateCampaignLibrary();
  const parsed = parseCampaignLibrary(next);
  commitLibrary(parsed);
  hydrateStoreIdStore();
  const keys = parsed.campaigns
    .map((item) => campaignKey(item.issued, item.validUntil))
    .filter((key): key is string => Boolean(key));
  activateImportedCampaigns(keys);
}

/** Merge selected stores from an import file into the device library. */
export function importStoredStores(
  incoming: CampaignLibrary,
  storeIds: Iterable<string>,
) {
  hydrateCampaignLibrary();
  const parsed = parseCampaignLibrary(incoming);
  const next = mergeStoresIntoLibrary(library, parsed, storeIds);
  if (next === library) return false;
  commitLibrary(next);
  hydrateStoreIdStore();
  const picked = pickStoresFromLibrary(parsed, storeIds);
  const keys = picked.campaigns
    .map((item) => campaignKey(item.issued, item.validUntil))
    .filter((key): key is string => Boolean(key));
  activateImportedCampaigns(keys);
  return true;
}

export type StoreImportPageSelection = {
  storeId: string;
  selection: StoreCopySelection;
};

/**
 * Apply per-store copy-style selections from an import file onto this device.
 * Charts referenced by the selections are upserted from the file first.
 */
export function importStoredStoreSelections(
  incoming: CampaignLibrary,
  pages: StoreImportPageSelection[],
) {
  hydrateCampaignLibrary();
  const parsed = parseCampaignLibrary(incoming);
  const usable = pages.filter(
    (page) =>
      /^\d{1,8}$/.test(page.storeId) &&
      parsed.stores[page.storeId] &&
      (page.selection.dates === true ||
        page.selection.list === true ||
        (page.selection.hiddenKeys?.length ?? 0) > 0 ||
        (page.selection.defaultNames?.length ?? 0) > 0 ||
        (page.selection.removeHiddenKeys?.length ?? 0) > 0 ||
        (page.selection.removeDefaultNames?.length ?? 0) > 0),
  );
  if (usable.length === 0) return false;

  const neededKeys = new Set(
    usable
      .map((page) => page.selection.campaignKey?.trim() || "")
      .filter(Boolean),
  );
  const byKey = new Map(
    library.campaigns.map((item) => [
      campaignKey(item.issued, item.validUntil) ?? "",
      item,
    ]),
  );
  let chartsChanged = false;
  for (const item of parsed.campaigns) {
    const key = campaignKey(item.issued, item.validUntil);
    if (!key || !neededKeys.has(key)) continue;
    const existing = library.campaigns.find(
      (row) => campaignKey(row.issued, row.validUntil) === key,
    );
    if (
      !existing ||
      existing.sourceUrl !== item.sourceUrl ||
      JSON.stringify(existing.pack) !== JSON.stringify(item.pack)
    ) {
      chartsChanged = true;
    }
    byKey.set(key, item);
  }
  let next: CampaignLibrary = {
    ...library,
    campaigns: [...byKey.values()].filter((item) =>
      Boolean(campaignKey(item.issued, item.validUntil)),
    ),
  };

  const touched = new Set<string>();
  for (const page of usable) {
    const source = parsed.stores[page.storeId]!;
    let selection = page.selection;
    if (
      page.storeId === getStoreId() &&
      selection.campaignKey &&
      getDeskState().imported &&
      campaignKey(
        getDeskState().pack.chart.issued,
        getDeskState().pack.chart.validUntil,
      ) === selection.campaignKey
    ) {
      selection = {
        ...selection,
        baseHidden: getHiddenEntries(),
        basePreset: getItemPreset(),
      };
    }
    const after = applyStoreCopyFrom(next, source, page.storeId, selection);
    if (after !== next) touched.add(page.storeId);
    next = after;
  }
  // Chart packs may change even when store settings were already identical.
  if (touched.size === 0 && !chartsChanged) return false;
  commitLibrary(next);
  hydrateStoreIdStore();
  const desk = getDeskState();
  const storeId = getStoreId();
  if (desk.imported && storeId && touched.has(storeId)) {
    const page = usable.find((item) => item.storeId === storeId);
    const dest = next.stores[storeId];
    if (dest && page) {
      if (page.selection.dates || page.selection.list) {
        applying = true;
        try {
          if (page.selection.dates) {
            setCompactDateFormat(dest.settings.compactDates === true);
            writeDebugDays(dest.settings.showDayCounts === true);
          }
          if (page.selection.list) {
            setCompactList(dest.settings.compactList === true);
          }
        } finally {
          applying = false;
        }
      }
      const key = page.selection.campaignKey?.trim() || "";
      if (
        key &&
        campaignKey(desk.pack.chart.issued, desk.pack.chart.validUntil) === key
      ) {
        const preset = dest.campaigns[key];
        if (preset) {
          applying = true;
          try {
            if (
              (page.selection.hiddenKeys?.length ?? 0) > 0 ||
              (page.selection.removeHiddenKeys?.length ?? 0) > 0
            ) {
              replaceHiddenNames(preset.hidden);
            }
            if (
              (page.selection.defaultNames?.length ?? 0) > 0 ||
              (page.selection.removeDefaultNames?.length ?? 0) > 0
            ) {
              replaceItemPreset(preset.preset);
            }
          } finally {
            applying = false;
          }
        }
      }
    }
  }
  // Desk UI reads shelf-life-desk-v1 — refresh it from the imported packs.
  activateImportedCampaigns(neededKeys);
  return true;
}

export function listCampaigns(): CampaignSummary[] {
  return snapshot;
}

export function listCampaignsServer(): CampaignSummary[] {
  return EMPTY_CAMPAIGNS;
}

export function subscribeCampaignLibrary(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listStoredForStore(storeId: string): StoreCampaignView[] {
  if (!storeId) return EMPTY_STORED;
  const cached = storedCache.get(storeId);
  if (cached) return cached;
  const next = listStoreCampaigns(library, storeId);
  const stable = next.length === 0 ? EMPTY_STORED : next;
  storedCache.set(storeId, stable);
  return stable;
}

export function listStoredForStoreServer(): StoreCampaignView[] {
  return EMPTY_STORED;
}

export function listStoredOnDevice(): DeviceStoredRecord[] {
  return deviceSnapshot;
}

export function listStoredOnDeviceServer(): DeviceStoredRecord[] {
  return EMPTY_DEVICE;
}

export function listStoreSettingsOnDevice(): DeviceStoreSettingsView[] {
  return storeSettingsSnapshot;
}

export function listStoreSettingsOnDeviceServer(): DeviceStoreSettingsView[] {
  return EMPTY_STORE_SETTINGS;
}

export function listStoreNames(): Record<string, string> {
  return storeNameSnapshot;
}

export function listStoreNamesServer(): Record<string, string> {
  return EMPTY_STORE_NAMES;
}

export function setStoreName(storeId: string, name: string) {
  hydrateCampaignLibrary();
  if (!/^\d{1,8}$/.test(storeId)) return;
  commitLibrary(writeStoreName(library, storeId, name));
}

/** Update a store's name and Dates / List display settings. */
export function writeStoreDisplaySettings(
  storeId: string,
  settings: Pick<StoreSettings, "name" | "compactDates" | "showDayCounts" | "compactList">,
) {
  hydrateCampaignLibrary();
  if (!/^\d{1,8}$/.test(storeId)) return;
  commitLibrary(writeStoreSettingsRecord(library, storeId, settings));
  if (storeId !== getStoreId()) return;
  applying = true;
  try {
    setCompactDateFormat(settings.compactDates === true);
    writeDebugDays(settings.showDayCounts === true);
    setCompactList(settings.compactList === true);
  } finally {
    applying = false;
  }
}

/**
 * Prefer the previously on-screen campaign when copying onto a newly loaded
 * chart; otherwise the newest other preset on this store.
 */
export function pickPresetCopySourceKey(
  storeId: string,
  toKey: string,
  preferredFromKey: string | null = null,
): string | null {
  hydrateCampaignLibrary();
  if (!/^\d{1,8}$/.test(storeId) || !toKey) return null;
  const others = listStoreCampaigns(library, storeId)
    .map((row) => campaignKey(row.issued, row.validUntil))
    .filter((key): key is string => Boolean(key) && key !== toKey);
  if (others.length === 0) return null;
  if (preferredFromKey && others.includes(preferredFromKey)) {
    return preferredFromKey;
  }
  others.sort((a, b) => {
    const aUntil = a.split("|")[1] ?? "";
    const bUntil = b.split("|")[1] ?? "";
    if (aUntil !== bUntil) return aUntil < bUntil ? 1 : -1;
    return a < b ? 1 : -1;
  });
  return others[0] ?? null;
}

/**
 * Copy selected items from one campaign preset onto another on the same store.
 * Uses the same selection shape as store-to-store / Stored import copy.
 */
export function copyCampaignPresetOnto(
  storeId: string,
  fromKey: string,
  toKey: string,
  selection: StoreCopySelection,
) {
  if (!/^\d{1,8}$/.test(storeId) || !fromKey || !toKey || fromKey === toKey) {
    return false;
  }
  return copyStoredStoreData(storeId, storeId, {
    ...selection,
    campaignKey: toKey,
    fromCampaignKey: fromKey,
  });
}

/** Copy selected settings / campaign items from one stored store onto another. */
export function copyStoredStoreData(
  fromStoreId: string,
  toStoreId: string,
  selection: StoreCopySelection,
) {
  hydrateCampaignLibrary();
  const key = selection.campaignKey?.trim() || "";
  const desk = getDeskState();
  const toCurrent = toStoreId === getStoreId();
  const liveMatches =
    toCurrent &&
    Boolean(key) &&
    desk.imported &&
    campaignKey(desk.pack.chart.issued, desk.pack.chart.validUntil) === key;
  // Match the copy popup's Old column (live screen) so unselected source
  // items are not re-inserted from a stale saved preset.
  const effective: StoreCopySelection = liveMatches
    ? {
        ...selection,
        baseHidden: getHiddenEntries(),
        basePreset: getItemPreset(),
      }
    : selection;
  const next = copyStoreData(library, fromStoreId, toStoreId, effective);
  if (next === library) return false;
  commitLibrary(next);
  if (!toCurrent) return true;
  const dest = next.stores[toStoreId];
  if (!dest) return true;
  if (selection.dates || selection.list) {
    applying = true;
    try {
      if (selection.dates) {
        setCompactDateFormat(dest.settings.compactDates === true);
        writeDebugDays(dest.settings.showDayCounts === true);
      }
      if (selection.list) {
        setCompactList(dest.settings.compactList === true);
      }
    } finally {
      applying = false;
    }
  }
  if (liveMatches) {
    const preset = dest.campaigns[key];
    if (preset) {
      applying = true;
      try {
        if (
          (selection.hiddenKeys?.length ?? 0) > 0 ||
          (selection.removeHiddenKeys?.length ?? 0) > 0
        ) {
          replaceHiddenNames(preset.hidden);
        }
        if (
          (selection.defaultNames?.length ?? 0) > 0 ||
          (selection.removeDefaultNames?.length ?? 0) > 0
        ) {
          replaceItemPreset(preset.preset);
        }
      } finally {
        applying = false;
      }
    }
  }
  return true;
}

export function readSavedCampaignSettings(
  storeId: string,
  issued: string,
  validUntil: string,
): StoreCampaignSettings | null {
  hydrateCampaignLibrary();
  return readStoreSettings(library, storeId, issued, validUntil);
}

function updateSavedCampaign(
  storeId: string,
  issued: string,
  validUntil: string,
  change: (current: StoreCampaignSettings) => StoreCampaignSettings,
) {
  hydrateCampaignLibrary();
  const saved = readStoreSettings(library, storeId, issued, validUntil);
  if (!saved) return;
  const next = change(saved);
  if (next === saved) return;
  commitLibrary(writeStoreSettings(library, storeId, issued, validUntil, next));
}

export function forgetSavedHidden(
  storeId: string,
  issued: string,
  validUntil: string,
  name: string,
) {
  updateSavedCampaign(storeId, issued, validUntil, (saved) => dropStoredHidden(saved, name));
}

export function forgetSavedDefault(
  storeId: string,
  issued: string,
  validUntil: string,
  name: string,
) {
  updateSavedCampaign(storeId, issued, validUntil, (saved) => dropStoredDefault(saved, name));
}

export function writeSavedDefault(
  storeId: string,
  issued: string,
  validUntil: string,
  name: string,
  section: SectionId,
) {
  updateSavedCampaign(storeId, issued, validUntil, (saved) =>
    setStoredDefault(saved, name, section),
  );
}

export function clearSavedHidden(storeId: string, issued: string, validUntil: string) {
  updateSavedCampaign(storeId, issued, validUntil, dropAllStoredHidden);
}

export function clearSavedDefaults(storeId: string, issued: string, validUntil: string) {
  updateSavedCampaign(storeId, issued, validUntil, dropAllStoredDefaults);
}

/** Remove a whole campaign preset from a store's stored data. */
export function forgetSavedCampaignPreset(
  storeId: string,
  issued: string,
  validUntil: string,
) {
  hydrateCampaignLibrary();
  const next = dropStoreCampaignPreset(library, storeId, issued, validUntil);
  if (next === library) return;
  commitLibrary(next);
}

/**
 * Remove an imported chart pack from Saved charts.
 * Returns true when the pack was present (caller can clear the desk if it was loaded).
 */
export function forgetCampaign(issued: string, validUntil: string): boolean {
  hydrateCampaignLibrary();
  const next = dropCampaign(library, issued, validUntil);
  if (next === library) return false;
  commitLibrary(next);
  return true;
}

export function subscribeStoredStore(listener: () => void) {
  const stopLibrary = subscribeCampaignLibrary(listener);
  const stopStore = subscribeStoreId(listener);
  return () => {
    stopLibrary();
    stopStore();
  };
}

function keptSettings(
  settings: StoreCampaignSettings,
  rules: ShelfRule[],
): StoreCampaignSettings {
  return {
    hidden: settings.hidden,
    preset: {
      ...settings.preset,
      defaults: retainProductDefaults(settings.preset.defaults, rules, settings.hidden),
    },
    compactDates: settings.compactDates === true,
    showDayCounts: settings.showDayCounts === true,
    compactList: settings.compactList === true,
  };
}

function currentSettings(): StoreCampaignSettings {
  const desk = getDeskState();
  return keptSettings(
    {
      hidden: getHiddenEntries(),
      preset: getItemPreset(),
      compactDates: getCompactDateFormat(),
      showDayCounts: readDebugDays(),
      compactList: getCompactList(),
    },
    desk.pack.rules,
  );
}

/** Hidden storages drop a matching saved storage default. */
function forgetHiddenDefaults() {
  if (applying) return;
  const hidden = getHiddenEntries();
  if (hidden.length === 0) return;
  const preset = getItemPreset();
  let changed = false;
  const defaults: ItemPreset["defaults"] = {};
  for (const [name, value] of Object.entries(preset.defaults)) {
    const blocked = hidden.some(
      (entry) =>
        entry.name === name &&
        (entry.section == null || entry.section === value.section),
    );
    if (blocked) {
      changed = true;
      continue;
    }
    defaults[name] = value;
  }
  if (!changed) return;
  replaceItemPreset({ ...preset, defaults });
}

function saveCurrent(storeId: string) {
  if (!storeId || applying) return;
  const desk = getDeskState();
  if (!desk.imported) return;
  const { issued, validUntil } = desk.pack.chart;
  commitLibrary(writeStoreSettings(library, storeId, issued, validUntil, currentSettings()));
}

function autosave() {
  if (applying) return;
  hydrateStoreIdStore();
  const storeId = getStoreId();
  if (!storeId) return;
  saveCurrent(storeId);
}

function applySettings(settings: StoreCampaignSettings, rules: ShelfRule[]) {
  const next = keptSettings(settings, rules);
  applying = true;
  try {
    replaceHiddenNames(next.hidden);
    replaceItemPreset(next.preset);
    setCompactDateFormat(next.compactDates === true);
    writeDebugDays(next.showDayCounts === true);
    // Compact list stays a session view; page load restores it via captureActiveCampaign.
  } finally {
    applying = false;
  }
}

function handleImportedPack(pack: ChartPack, sourceUrl: string) {
  hydrateCampaignLibrary();
  hydrateStoreIdStore();
  commitLibrary(upsertCampaign(library, pack, sourceUrl, new Date().toISOString()));
  const { issued, validUntil } = pack.chart;
  const storeId = getStoreId();
  const saved = storeId ? readStoreSettings(library, storeId, issued, validUntil) : null;
  applying = true;
  try {
    if (saved) {
      applySettings(saved, pack.rules);
      setCompactList(saved.compactList === true);
    } else if (storeId && campaignKey(issued, validUntil)) {
      clearHiddenNames();
      resetItemPreset();
      setCompactDateFormat(false);
      writeDebugDays(false);
      setCompactList(false);
    } else {
      clearHiddenNames();
    }
  } finally {
    applying = false;
  }
  // Always rewrite the store preset so title/version track the imported pack.
  if (storeId && campaignKey(issued, validUntil)) saveCurrent(storeId);
}

function handlePackCleared() {
  hydrateStoreIdStore();
  applying = true;
  try {
    clearHiddenNames();
    if (getStoreId()) resetItemPreset();
  } finally {
    applying = false;
  }
}

/** Remember the chart already on screen so Import can load it again. */
export function captureActiveCampaign() {
  hydrateCampaignLibrary();
  hydrateStoreIdStore();
  const desk = getDeskState();
  if (!desk.imported) return;
  const { issued, validUntil } = desk.pack.chart;
  if (!campaignKey(issued, validUntil)) return;
  commitLibrary(upsertCampaign(library, desk.pack, desk.sourceUrl, new Date().toISOString()));
  const storeId = getStoreId();
  if (!storeId) return;
  const saved = readStoreSettings(library, storeId, issued, validUntil);
  if (!saved) {
    saveCurrent(storeId);
    return;
  }
  applying = true;
  try {
    setCompactDateFormat(saved.compactDates === true);
    writeDebugDays(saved.showDayCounts === true);
    setCompactList(saved.compactList === true);
  } finally {
    applying = false;
  }
}

/**
 * Save the previous store, then keep the screen or load the new store's copy.
 * `keepCurrent` true writes the screen onto the new store.
 * `keepCurrent` false loads that store's saved copy, or clears the screen when it has none.
 */
export function adoptStoreForCampaign(
  previousStoreId: string,
  nextStoreId: string,
  keepCurrent?: boolean,
  nextSettings?: StoreCampaignSettings,
) {
  hydrateCampaignLibrary();
  hydrateStoreIdStore();
  const desk = getDeskState();
  if (!desk.imported) return;
  const { issued, validUntil } = desk.pack.chart;
  if (!campaignKey(issued, validUntil)) return;
  const planned = planStoreChange({
    library,
    previousStoreId,
    nextStoreId,
    issued,
    validUntil,
    current: currentSettings(),
    keepCurrent,
    nextSettings,
  });
  commitLibrary(planned.library);
  if (planned.restore) applySettings(planned.restore, desk.pack.rules);
}

export function reloadCampaign(issued: string, validUntil: string) {
  hydrateCampaignLibrary();
  const key = campaignKey(issued, validUntil);
  if (!key) return;
  const record = library.campaigns.find(
    (item) => campaignKey(item.issued, item.validUntil) === key,
  );
  if (!record) return;
  setImportedPack(record.pack, record.sourceUrl);
}

onPackImported(handleImportedPack);
onPackCleared(handlePackCleared);
subscribeHidden(() => {
  forgetHiddenDefaults();
  autosave();
});
subscribeItemPreset(autosave);
subscribeDateFormat(autosave);
subscribeDebug(autosave);
subscribeCompactList(autosave);
subscribeStoreId(autosave);
