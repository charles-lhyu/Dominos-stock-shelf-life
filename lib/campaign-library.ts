import {
  campaignKey,
  emptyCampaignLibrary,
  listCampaignSummaries,
  listDeviceStored,
  listStoreCampaigns,
  dropAllStoredDefaults,
  dropAllStoredHidden,
  dropStoredDefault,
  dropStoredHidden,
  setStoredDefault,
  parseCampaignLibrary,
  planStoreChange,
  readStoreSettings,
  upsertCampaign,
  writeStoreName,
  writeStoreSettings,
  type CampaignLibrary,
  type CampaignSummary,
  type DeviceStoredRecord,
  type StoreCampaignSettings,
  type StoreCampaignView,
} from "./campaign-records";
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
const EMPTY_STORE_NAMES: Record<string, string> = {};
let storeNameSnapshot: Record<string, string> = EMPTY_STORE_NAMES;

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
  if (hadRaw) {
    // Rewrite once so legacy flat stores land as store-first on disk.
    commitLibrary(library);
  } else {
    refreshSnapshot();
  }
}

/** Snapshot of the device Stored data library (charts + store presets). */
export function getCampaignLibrary(): CampaignLibrary {
  hydrateCampaignLibrary();
  return library;
}

/**
 * Replace the whole Stored data library (import). Re-applies the active
 * store's settings for the chart on screen when possible.
 */
export function replaceCampaignLibrary(next: CampaignLibrary) {
  hydrateCampaignLibrary();
  const parsed = parseCampaignLibrary(next);
  commitLibrary(parsed);
  hydrateStoreIdStore();
  const desk = getDeskState();
  const storeId = getStoreId();
  if (!desk.imported || !storeId) return;
  const { issued, validUntil } = desk.pack.chart;
  const saved = readStoreSettings(parsed, storeId, issued, validUntil);
  if (saved) applySettings(saved, desk.pack.rules);
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
  if (storeId && !saved) saveCurrent(storeId);
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
