"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  FileText,
  ImageUp,
  Link2,
  Lock,
  QrCode,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Settings,
  Sun,
  Type,
  Unlock,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Equal,
  Minus,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { ChangelogBrowser } from "@/components/changelog-notes";
import { UpdateConfirmDialog } from "@/components/update-confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adoptStoreForCampaign,
  clearSavedDefaults,
  clearSavedHidden,
  forgetSavedDefault,
  forgetSavedHidden,
  getCampaignLibrary,
  hydrateCampaignLibrary,
  listCampaigns,
  listCampaignsServer,
  listStoredForStore,
  listStoredForStoreServer,
  listStoredOnDevice,
  listStoredOnDeviceServer,
  listStoreNames,
  listStoreNamesServer,
  listStoreSettingsOnDevice,
  listStoreSettingsOnDeviceServer,
  readSavedCampaignSettings,
  reloadCampaign,
  importStoredStoreSelections,
  subscribeCampaignLibrary,
  subscribeStoredStore,
  writeSavedDefault,
  writeStoreDisplaySettings,
  copyStoredStoreData,
} from "@/lib/campaign-library";
import { canonicalProductName } from "@/lib/chart-name-migrate";
import {
  buildStoredLibraryPayload,
  parseStoredLibraryPayload,
  summarizeStoredLibrary,
  type StoredLibraryPayload,
} from "@/lib/stored-library-io";
import { CHANGELOG } from "@/lib/changelog";
import { parseChartPack } from "@/lib/chart-pack";
import { formatCompactDate, formatLongDate, formatShortDate } from "@/lib/dates";
import {
  getCompactDateFormat,
  subscribeDateFormat,
} from "@/lib/date-format-store";
import { getCompactList, subscribeCompactList } from "@/lib/compact-list-store";
import {
  applyAcceptedStoreChanges,
  campaignKey,
  listStoreSettingChanges,
} from "@/lib/campaign-records";
import {
  readDebug,
  readDebugDays,
  subscribeDebug,
  writeDebug,
  writeDebugDays,
} from "@/lib/debug-store";
import {
  clearHiddenNames,
  formatHiddenLabel,
  getHiddenEntries,
  getHiddenEntriesServer,
  getHiddenNames,
  getHiddenNamesServer,
  hiddenEntryKey,
  subscribeHidden,
  unhideByKey,
} from "@/lib/hidden-store";
import type { HiddenEntry } from "@/lib/hidden-entries";
import {
  clearImportedPack,
  setImportedPack,
  type DeskState,
} from "@/lib/desk-store";
import { clearPdfCrops, replacePdfCrops } from "@/lib/pdf-crop-images";
import { parsePdfChartFile } from "@/lib/pdf-chart";
import {
  listInvalidProductDefaults,
  type InvalidProductDefault,
} from "@/lib/invalid-presets";
import {
  applyProductDefaultUpdate,
  clearProductDefaults,
  getItemPreset,
  getItemPresetServer,
  hydrateItemPresetStore,
  removeProductDefault,
  setProductDefault,
  subscribeItemPreset,
  type ItemPreset,
  type ProductDefault,
} from "@/lib/item-preset-store";
import { prepClockTime, SECTION_ORDER, SECTION_TAG } from "@/lib/preview";
import {
  appVersionLabel,
  getAppUpdateInfo,
  reloadAppToLatest,
} from "@/lib/reload-app";
import { textConversionTable } from "@/lib/text-conversion";
import { fetchRemoteChart } from "@/lib/remote-chart";
import type { ChartPack, SectionId, ShelfRule } from "@/lib/types";
import {
  getKeepAwake,
  getKeepAwakeServer,
  hydrateKeepAwakeStore,
  setKeepAwake,
  subscribeKeepAwake,
} from "@/lib/keep-awake-store";
import {
  DEFAULT_ROTATION_PREF,
  getRotationPref,
  hydrateRotationStore,
  setPreferredOrientation,
  setRotationLocked,
  subscribeRotation,
} from "@/lib/rotation-store";
import {
  getStoreId,
  getStoreIdServer,
  hydrateStoreIdStore,
  normalizeStoreId,
  setStoreId,
  subscribeStoreId,
} from "@/lib/store-id-store";
import {
  getTextSize,
  getTextSizeServer,
  hydrateTextSizeStore,
  setTextSize,
  subscribeTextSize,
  TEXT_SIZE_OPTIONS,
} from "@/lib/text-size-store";
import { cn } from "cn";
import { toast } from "sonner";

type SettingsSectionId =
  | "settings-chart"
  | "settings-display"
  | "settings-debug"
  | "settings-app"
  | "settings-system";

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "settings-app",
  "settings-chart",
  "settings-display",
  "settings-debug",
  "settings-system",
];

type StoredCampaignDraft = {
  issued: string;
  validUntil: string;
  title: string;
  onScreen: boolean;
  hidden: HiddenEntry[];
  baselineHidden: HiddenEntry[];
  defaults: Record<string, ProductDefault>;
  baselineDefaults: Record<string, ProductDefault>;
};

type StoreDatesMode = "full" | "short" | "days";
type StoreListMode = "tags" | "compact";

const STORE_DATES_LABELS: Record<StoreDatesMode, string> = {
  full: "Full",
  short: "Short",
  days: "Days and hours",
};

const STORE_LIST_LABELS: Record<StoreListMode, string> = {
  tags: "Normal",
  compact: "Compact",
};

function storeDatesMode(compactDates: boolean, showDayCounts: boolean): StoreDatesMode {
  if (showDayCounts) return "days";
  if (compactDates) return "short";
  return "full";
}

function storeListMode(compactList: boolean): StoreListMode {
  return compactList ? "compact" : "tags";
}

type StoredEditDraft = {
  storeId: string;
  storeName: string;
  baselineStoreName: string;
  compactDates: boolean;
  baselineCompactDates: boolean;
  showDayCounts: boolean;
  baselineShowDayCounts: boolean;
  compactList: boolean;
  baselineCompactList: boolean;
  campaigns: Record<string, StoredCampaignDraft>;
};

type StoredEditChange = {
  id: string;
  group: "Store" | "Hidden" | "Defaults";
  label: string;
  from: string;
  to: string;
};

function copyDefaults(
  defaults: Record<string, ProductDefault>,
): Record<string, ProductDefault> {
  const next: Record<string, ProductDefault> = {};
  for (const [name, value] of Object.entries(defaults)) {
    if (!value.section) continue;
    next[name] = { section: value.section, life: null };
  }
  return next;
}

function storageChoiceLabel(value: ProductDefault | undefined): string {
  return value?.section ? SECTION_TAG[value.section] : "None";
}

function listStoredEditChanges(draft: StoredEditDraft): StoredEditChange[] {
  const changes: StoredEditChange[] = [];
  if (draft.storeName !== draft.baselineStoreName) {
    changes.push({
      id: "store:name",
      group: "Store",
      label: "Store name",
      from: draft.baselineStoreName.trim() || "Not set",
      to: draft.storeName.trim() || "Not set",
    });
  }
  const baselineDates = storeDatesMode(
    draft.baselineCompactDates,
    draft.baselineShowDayCounts,
  );
  const nextDates = storeDatesMode(draft.compactDates, draft.showDayCounts);
  if (baselineDates !== nextDates) {
    changes.push({
      id: "store:dates",
      group: "Store",
      label: "Dates",
      from: STORE_DATES_LABELS[baselineDates],
      to: STORE_DATES_LABELS[nextDates],
    });
  }
  const baselineList = storeListMode(draft.baselineCompactList);
  const nextList = storeListMode(draft.compactList);
  if (baselineList !== nextList) {
    changes.push({
      id: "store:list",
      group: "Store",
      label: "List",
      from: STORE_LIST_LABELS[baselineList],
      to: STORE_LIST_LABELS[nextList],
    });
  }
  const campaignCount = Object.keys(draft.campaigns).length;
  for (const [campKey, campaign] of Object.entries(draft.campaigns)) {
    const suffix =
      campaignCount > 1
        ? ` · ${campaign.title || formatShortDate(campaign.validUntil)}`
        : "";
    const remaining = new Set(campaign.hidden.map((entry) => hiddenEntryKey(entry)));
    for (const entry of campaign.baselineHidden) {
      const key = hiddenEntryKey(entry);
      if (remaining.has(key)) continue;
      changes.push({
        id: `hidden:${campKey}:${key}`,
        group: "Hidden",
        label: `${formatHiddenLabel(entry)}${suffix}`,
        from: "Hidden",
        to: "Shown",
      });
    }
    const names = new Set([
      ...Object.keys(campaign.baselineDefaults),
      ...Object.keys(campaign.defaults),
    ]);
    for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
      const from = campaign.baselineDefaults[name];
      const to = campaign.defaults[name];
      if ((from?.section ?? null) === (to?.section ?? null)) continue;
      changes.push({
        id: `default:${campKey}:${name}`,
        group: "Defaults",
        label: `${name}${suffix}`,
        from: storageChoiceLabel(from),
        to: storageChoiceLabel(to),
      });
    }
  }
  return changes;
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

export function ImportChartButton({
  desk,
  open: openProp,
  onOpenChange,
  onOpenProduct,
  compact = false,
}: {
  desk: DeskState;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Close settings and show this product, including when it is hidden. */
  onOpenProduct?: (name: string) => void;
  /** Smaller trigger for the always-visible store bar. */
  compact?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [url, setUrl] = useState(desk.sourceUrl);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    localVersion: string;
    remoteVersion: string;
    notes: string[];
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [storeDraft, setStoreDraft] = useState("");
  const [storeIdError, setStoreIdError] = useState<string | null>(null);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [storeMenuAll, setStoreMenuAll] = useState(false);
  const [storePrompt, setStorePrompt] = useState<{ next: string; hasSaved: boolean } | null>(
    null,
  );
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeChoices, setChangeChoices] = useState<string[]>([]);
  const [storedEditing, setStoredEditing] = useState(false);
  const [storedDraft, setStoredDraft] = useState<StoredEditDraft | null>(null);
  const [storedConfirmOpen, setStoredConfirmOpen] = useState(false);
  /** In-panel Import / Export store picker (same style as copy popup). */
  const [storedIo, setStoredIo] = useState<
    | { mode: "export" }
    | {
        mode: "import";
        step: "pick" | "review";
        summary: { stores: number; campaigns: number; charts: number };
        library: StoredLibraryPayload["library"];
        storeId?: string;
        reviewIds: string[];
        reviewIndex: number;
      }
    | null
  >(null);
  const [storedIoChoices, setStoredIoChoices] = useState<string[]>([]);
  /** Per-store copy-style item choices while paging import review. */
  const [storedIoReviewChoices, setStoredIoReviewChoices] = useState<
    Record<string, string[]>
  >({});
  const [allStoredOpen, setAllStoredOpen] = useState(false);
  /** Store id being previewed inside Show all; null = card list. */
  const [allStoredPreviewId, setAllStoredPreviewId] = useState<string | null>(
    null,
  );
  /** Campaign key (`issued|validUntil`) in Show all detail; null = campaign list. */
  const [allStoredPreviewCampaignKey, setAllStoredPreviewCampaignKey] =
    useState<string | null>(null);
  /** ⋮ menu / copy flow for a store card in Show all. */
  const [storeAction, setStoreAction] = useState<{
    storeId: string;
    step: "menu" | "copy";
  } | null>(null);
  const [storeCopyChoices, setStoreCopyChoices] = useState<string[]>([]);
  /** Blocks clicks under the copy popup for a beat after dismiss (ghost taps). */
  const [storeActionClickGuard, setStoreActionClickGuard] = useState(false);
  const storeActionGuardTimer = useRef<number | null>(null);
  const [storeSettingsOpen, setStoreSettingsOpen] = useState(true);
  const [campaignPresetsOpen, setCampaignPresetsOpen] = useState(true);
  const storedImportInputRef = useRef<HTMLInputElement>(null);
  const storePromptRef = useRef<string | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("settings-app");
  const [settingsEndPad, setSettingsEndPad] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsBodyRef = useRef<HTMLDivElement>(null);
  const settingsNavRef = useRef<HTMLDivElement>(null);
  const settingsJumpLock = useRef(false);
  const settingsJumpTimer = useRef<number | null>(null);
  const storeFieldRef = useRef<HTMLDivElement>(null);
  const storeMenuListRef = useRef<HTMLUListElement>(null);
  const [storeMenuPos, setStoreMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const debug = useSyncExternalStore(subscribeDebug, readDebug, () => false);
  const debugDays = useSyncExternalStore(
    subscribeDebug,
    readDebugDays,
    () => false,
  );
  const compactDates = useSyncExternalStore(
    subscribeDateFormat,
    getCompactDateFormat,
    () => false,
  );
  const compactList = useSyncExternalStore(subscribeCompactList, getCompactList, () => false);
  const hiddenNames = useSyncExternalStore(
    subscribeHidden,
    getHiddenNames,
    getHiddenNamesServer,
  );
  const hiddenEntries = useSyncExternalStore(
    subscribeHidden,
    getHiddenEntries,
    getHiddenEntriesServer,
  );
  const itemPreset = useSyncExternalStore(
    subscribeItemPreset,
    () => {
      hydrateItemPresetStore();
      return getItemPreset();
    },
    getItemPresetServer,
  );
  const rotation = useSyncExternalStore(
    subscribeRotation,
    () => {
      hydrateRotationStore();
      return getRotationPref();
    },
    () => DEFAULT_ROTATION_PREF,
  );
  const keepAwake = useSyncExternalStore(
    subscribeKeepAwake,
    () => {
      hydrateKeepAwakeStore();
      return getKeepAwake();
    },
    getKeepAwakeServer,
  );
  const textSize = useSyncExternalStore(
    subscribeTextSize,
    () => {
      hydrateTextSizeStore();
      return getTextSize();
    },
    getTextSizeServer,
  );
  const storeId = useSyncExternalStore(
    subscribeStoreId,
    () => {
      hydrateStoreIdStore();
      return getStoreId();
    },
    getStoreIdServer,
  );
  const campaigns = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listCampaigns();
    },
    listCampaignsServer,
  );
  const storedForStore = useSyncExternalStore(
    subscribeStoredStore,
    () => {
      hydrateCampaignLibrary();
      hydrateStoreIdStore();
      return listStoredForStore(getStoreId());
    },
    listStoredForStoreServer,
  );
  const deviceStored = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listStoredOnDevice();
    },
    listStoredOnDeviceServer,
  );
  const deviceStoreSettings = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listStoreSettingsOnDevice();
    },
    listStoreSettingsOnDeviceServer,
  );
  const storeNames = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listStoreNames();
    },
    listStoreNamesServer,
  );

  useEffect(() => () => stopScan(), []);

  useEffect(
    () => () => {
      if (storeActionGuardTimer.current != null) {
        window.clearTimeout(storeActionGuardTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    hydrateStoreIdStore();
    setStoreDraft(getStoreId());
    setStoreIdError(null);
    setStoreMenuOpen(false);
    setStoreMenuAll(false);
    setStoredEditing(false);
    setStoredDraft(null);
    setStoredConfirmOpen(false);
    setStoredIo(null);
    setStoredIoChoices([]);
    setStoredIoReviewChoices({});
    setActiveSettingsSection("settings-app");
    const raf = window.requestAnimationFrame(() => {
      settingsBodyRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!allStoredPreviewId) {
      setAllStoredPreviewCampaignKey(null);
      return;
    }
    if (
      !deviceStoreSettings.some((store) => store.storeId === allStoredPreviewId)
    ) {
      setAllStoredPreviewId(null);
      setAllStoredPreviewCampaignKey(null);
    }
  }, [allStoredPreviewId, deviceStoreSettings]);

  useEffect(() => {
    if (!storeMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (storeFieldRef.current?.contains(target)) return;
      if (storeMenuListRef.current?.contains(target)) return;
      setStoreMenuOpen(false);
      setStoreMenuAll(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [storeMenuOpen]);

  function handleOpenChange(next: boolean) {
    if (!next && storePromptRef.current) return;
    // Close All stored first; keep Settings open until a second dismiss.
    if (!next && allStoredOpen) {
      setAllStoredOpen(false);
      setAllStoredPreviewId(null);
      return;
    }
    if (next) {
      hydrateStoreIdStore();
      setStoreDraft(getStoreId());
      setStoreIdError(null);
      setStoreMenuOpen(false);
      setStoreMenuAll(false);
      setUrl(desk.sourceUrl);
      setConfirmReset(false);
      setChangelogOpen(false);
      setUpdateConfirmOpen(false);
      setActiveSettingsSection("settings-app");
    } else {
      stopScan();
      setConfirmReset(false);
      setChangelogOpen(false);
      setUpdateConfirmOpen(false);
      if (settingsJumpTimer.current != null) {
        window.clearTimeout(settingsJumpTimer.current);
        settingsJumpTimer.current = null;
      }
      settingsJumpLock.current = false;
      storePromptRef.current = null;
      setStorePrompt(null);
      setChangesOpen(false);
      setChangeChoices([]);
      setStoreDraft(getStoreId());
      // Quit Settings while editing — drop the draft, do not apply.
      setStoredEditing(false);
      setStoredDraft(null);
      setStoredConfirmOpen(false);
      setStoredIo(null);
      setStoredIoChoices([]);
      setStoredIoReviewChoices({});
      setAllStoredOpen(false);
      setAllStoredPreviewId(null);
      setStoreMenuOpen(false);
      setStoreMenuAll(false);
    }
    setOpen(next);
  }

  function applyStoreChange(previous: string, next: string, keepCurrent?: boolean) {
    setStoreId(next);
    setStoreDraft(next);
    adoptStoreForCampaign(previous, next, keepCurrent);
  }

  function closeStorePrompt() {
    storePromptRef.current = null;
    setStorePrompt(null);
    setChangesOpen(false);
    setChangeChoices([]);
  }

  function cancelStorePrompt() {
    if (!storePromptRef.current) return;
    closeStorePrompt();
    setStoreDraft(getStoreId());
  }

  function confirmStorePrompt(keepCurrent: boolean) {
    const next = storePromptRef.current;
    if (!next) return;
    const previous = getStoreId();
    closeStorePrompt();
    applyStoreChange(previous, next, keepCurrent);
  }

  function acceptSelectedChanges() {
    const next = storePromptRef.current;
    if (!next || !desk.imported || changeChoices.length === 0) return;
    const previous = getStoreId();
    const saved = readSavedCampaignSettings(
      next,
      desk.pack.chart.issued,
      desk.pack.chart.validUntil,
    );
    const merged = applyAcceptedStoreChanges(
      {
        hidden: getHiddenEntries(),
        preset: getItemPreset(),
        compactDates: getCompactDateFormat(),
        showDayCounts: readDebugDays(),
        compactList: getCompactList(),
      },
      saved,
      changeChoices,
    );
    closeStorePrompt();
    setStoreId(next);
    setStoreDraft(next);
    adoptStoreForCampaign(previous, next, undefined, merged);
  }

  function commitStoreIdValue(raw: string) {
    if (storeActionClickGuard) return;
    setStoreMenuOpen(false);
    setStoreMenuAll(false);
    const next = normalizeStoreId(raw);
    if (next == null) {
      setStoreIdError("Store ID is numbers only, up to 8 digits.");
      return;
    }
    setStoreIdError(null);
    const previous = getStoreId();
    if (next === previous) {
      setStoreDraft(next);
      return;
    }
    if (!next || !desk.imported || storePromptRef.current === next) {
      if (storePromptRef.current === next) return;
      applyStoreChange(previous, next);
      return;
    }
    hydrateCampaignLibrary();
    hydrateItemPresetStore();
    const saved = readSavedCampaignSettings(
      next,
      desk.pack.chart.issued,
      desk.pack.chart.validUntil,
    );
    const screenHas =
      getHiddenNames().length > 0 ||
      Object.keys(getItemPreset().defaults).length > 0 ||
      getCompactDateFormat() ||
      readDebugDays() ||
      getCompactList();
    if (!screenHas && !saved) {
      applyStoreChange(previous, next);
      return;
    }
    // An existing store loads its saved copy; only ask when that store has none.
    if (saved) {
      applyStoreChange(previous, next, false);
      return;
    }
    storePromptRef.current = next;
    setStoreDraft(next);
    setChangesOpen(false);
    setChangeChoices([]);
    setStorePrompt({ next, hasSaved: false });
  }

  function commitStoreDraft() {
    commitStoreIdValue(storeDraft);
  }

  function toggleStoreCopyChoice(id: string) {
    setStoreCopyChoices((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function setStoreCopyGroup(ids: string[], on: boolean) {
    setStoreCopyChoices((current) => {
      const without = current.filter((item) => !ids.includes(item));
      return on ? [...without, ...ids] : without;
    });
  }

  /** Close copy/menu without applying. Guards against ghost taps selecting a store. */
  function dismissStoreAction() {
    setStoreAction(null);
    setStoreCopyChoices([]);
    setStoreActionClickGuard(true);
    if (storeActionGuardTimer.current != null) {
      window.clearTimeout(storeActionGuardTimer.current);
    }
    storeActionGuardTimer.current = window.setTimeout(() => {
      storeActionGuardTimer.current = null;
      setStoreActionClickGuard(false);
    }, 400);
  }

  function confirmStoreCopy() {
    if (!storeAction || storeAction.step !== "copy") return;
    const fromStoreId = storeAction.storeId;
    const toStoreId = storeId;
    if (!toStoreId || fromStoreId === toStoreId) {
      toast.error("Select a different current store to copy into.");
      return;
    }
    const selected = [...storeCopyChoices];
    // Closing / empty selection must never mutate campaign items.
    if (selected.length === 0) {
      dismissStoreAction();
      return;
    }
    const campaignKeyValue =
      autoPreviewCampaignKey(fromStoreId) ||
      autoPreviewCampaignKey(toStoreId) ||
      (desk.imported
        ? campaignKey(desk.pack.chart.issued, desk.pack.chart.validUntil)
        : null);
    const sourceHiddenKeys = new Set(
      deviceStored
        .filter(
          (item) =>
            item.storeId === fromStoreId &&
            campaignKey(item.issued, item.validUntil) === campaignKeyValue,
        )
        .flatMap((item) => item.hidden.map((entry) => hiddenEntryKey(entry))),
    );
    const sourceDefaultNames = new Set(
      deviceStored
        .filter(
          (item) =>
            item.storeId === fromStoreId &&
            campaignKey(item.issued, item.validUntil) === campaignKeyValue,
        )
        .flatMap((item) =>
          Object.entries(item.preset.defaults)
            .filter(([, value]) => value.section)
            .map(([name]) => name),
        ),
    );
    const hiddenKeys: string[] = [];
    const removeHiddenKeys: string[] = [];
    for (const id of selected) {
      if (!id.startsWith("hidden:")) continue;
      const key = id.slice("hidden:".length);
      if (sourceHiddenKeys.has(key)) hiddenKeys.push(key);
      else removeHiddenKeys.push(key);
    }
    const defaultNames: string[] = [];
    const removeDefaultNames: string[] = [];
    for (const id of selected) {
      if (!id.startsWith("default:")) continue;
      const name = id.slice("default:".length);
      if (sourceDefaultNames.has(name)) defaultNames.push(name);
      else removeDefaultNames.push(name);
    }
    const copied = copyStoredStoreData(fromStoreId, toStoreId, {
      dates: selected.includes("dates"),
      list: selected.includes("list"),
      campaignKey:
        hiddenKeys.length > 0 ||
        defaultNames.length > 0 ||
        removeHiddenKeys.length > 0 ||
        removeDefaultNames.length > 0
          ? campaignKeyValue
          : null,
      hiddenKeys,
      defaultNames,
      removeHiddenKeys,
      removeDefaultNames,
    });
    dismissStoreAction();
    if (!copied) {
      toast.error("Nothing was copied.");
      return;
    }
    toast.success(`Copied into store ${toStoreId}.`);
  }

  function resetChart() {
    void clearPdfCrops();
    clearImportedPack();
    setUrl("");
    setConfirmReset(false);
    toast.success("Chart cleared.");
  }

  function stopScan() {
    if (scanTimer.current != null) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  async function commitPack(
    pack: ChartPack,
    source: string,
    crops?: Record<string, string>,
  ) {
    if (crops && Object.keys(crops).length > 0) {
      await replacePdfCrops(crops);
    } else {
      await clearPdfCrops();
    }
    setImportedPack(pack, source);
    stopScan();
    const count = pack.rules.length;
    toast.success(
      count === 1 ? "Imported 1 item" : `Imported ${count} items`,
    );
    setOpen(false);
  }

  async function applyPack(pack: Awaited<ReturnType<typeof parseChartPack>>, source: string) {
    if (!pack.ok) {
      toast.error(pack.error);
      return;
    }
    await commitPack(pack.pack, source);
  }

  async function importFromUrl(nextUrl: string) {
    setBusy(true);
    const result = await fetchRemoteChart(nextUrl);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setUrl(nextUrl.trim());
    await commitPack(result.pack, nextUrl.trim(), result.crops);
  }

  async function importFromText(raw: string, source: string) {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("{")) {
      await importFromUrl(trimmed);
      return;
    }
    try {
      await applyPack(parseChartPack(JSON.parse(trimmed)), source);
    } catch {
      toast.error("That file is not valid chart JSON.");
    }
  }

  async function readQrFromImage(file: File) {
    setBusy(true);
    try {
      if (!window.BarcodeDetector) {
        toast.error(
          "This phone browser cannot read QR codes from photos. Try a file or URL.",
        );
        return;
      }
      const bitmap = await createImageBitmap(file);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const value = codes[0]?.rawValue?.trim();
      if (!value) {
        toast.error("No QR code found in that picture.");
        return;
      }
      if (/^https?:\/\//i.test(value)) {
        setUrl(value);
        await importFromUrl(value);
      } else {
        await importFromText(value, "photo-qr");
      }
    } catch {
      toast.error("Could not read that picture.");
    } finally {
      setBusy(false);
    }
  }

  async function startScan() {
    if (!window.BarcodeDetector) {
      toast.error(
        "Live QR scanning is not supported here. Use a photo, file, or URL.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      scanTimer.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue?.trim();
          if (!value) return;
          stopScan();
          if (/^https?:\/\//i.test(value)) {
            setUrl(value);
            await importFromUrl(value);
          } else {
            await importFromText(value, "live-qr");
          }
        } catch {
          // Keep scanning.
        }
      }, 450);
    } catch {
      toast.error("Camera permission was blocked.");
      stopScan();
    }
  }

  const settingsNav = [
    { id: "settings-app" as const, label: "App" },
    { id: "settings-chart" as const, label: "Import" },
    { id: "settings-display" as const, label: "Display" },
    { id: "settings-debug" as const, label: "Debug" },
    { id: "settings-system" as const, label: "System" },
  ];

  const activeSettingsLabel =
    settingsNav.find((item) => item.id === activeSettingsSection)?.label ??
    "App";

  const settingsSelectLabels = Object.fromEntries(
    settingsNav.map((item) => [item.id, item.label]),
  );
  const storedStoreIds = [
    ...new Set([
      ...deviceStoreSettings.map((item) => item.storeId),
      ...deviceStored.map((item) => item.storeId),
    ]),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const storeQuery = storeDraft.trim().replace(/\s+/g, "");
  const menuStoreIds = storeMenuAll
    ? storedStoreIds
    : storeQuery
      ? storedStoreIds.filter((id) => id.startsWith(storeQuery))
      : storedStoreIds;
  const draftStoreId = normalizeStoreId(storeDraft);
  const previewStoreId = draftStoreId && draftStoreId !== storeId ? draftStoreId : null;
  const previewRows = previewStoreId
    ? deviceStored.filter((item) => item.storeId === previewStoreId)
    : [];
  const storeMenuVisible = storeMenuOpen && storedStoreIds.length > 0;
  const showStoreClear = storeDraft.trim().length > 0;

  function syncStoreMenuPos() {
    const field = storeFieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    setStoreMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }

  useLayoutEffect(() => {
    if (!storeMenuVisible) {
      setStoreMenuPos(null);
      return;
    }
    syncStoreMenuPos();
    const body = settingsBodyRef.current;
    window.addEventListener("resize", syncStoreMenuPos);
    body?.addEventListener("scroll", syncStoreMenuPos, { passive: true });
    return () => {
      window.removeEventListener("resize", syncStoreMenuPos);
      body?.removeEventListener("scroll", syncStoreMenuPos);
    };
  }, [storeMenuVisible, menuStoreIds.length, storeDraft, showStoreClear]);
  const storeChanges =
    storePrompt && desk.imported
      ? listStoreSettingChanges(
          {
            hidden: hiddenEntries,
            preset: itemPreset,
            compactDates,
            showDayCounts: debugDays,
            compactList,
          },
          readSavedCampaignSettings(
            storePrompt.next,
            desk.pack.chart.issued,
            desk.pack.chart.validUntil,
          ),
        )
      : [];
  const allChangesSelected =
    storeChanges.length > 0 &&
    storeChanges.every((change) => changeChoices.includes(change.id));

  function chartOnScreen(issued: string, validUntil: string) {
    return (
      desk.imported &&
      desk.pack.chart.issued === issued &&
      desk.pack.chart.validUntil === validUntil
    );
  }

  /** Prefer the on-screen chart's campaign for a store preview; else the first saved preset. */
  function autoPreviewCampaignKey(forStoreId: string): string | null {
    const rows = deviceStored.filter((item) => item.storeId === forStoreId);
    if (rows.length === 0) return null;
    if (desk.imported) {
      const current = campaignKey(
        desk.pack.chart.issued,
        desk.pack.chart.validUntil,
      );
      if (
        current &&
        rows.some(
          (item) => campaignKey(item.issued, item.validUntil) === current,
        )
      ) {
        return current;
      }
    }
    return campaignKey(rows[0]!.issued, rows[0]!.validUntil);
  }

  function withLiveSettings<
    T extends { hidden: HiddenEntry[]; preset: ItemPreset; rules?: ShelfRule[] },
  >(
    item: T,
  ): T & {
    rules: ShelfRule[];
    compactDates: boolean;
    showDayCounts: boolean;
    compactList: boolean;
  } {
    return {
      ...item,
      hidden: hiddenEntries,
      compactDates,
      showDayCounts: debugDays,
      compactList,
      rules: desk.pack.rules,
      // Keep raw defaults so invalid old labels still show in Stored data.
      preset: itemPreset,
    };
  }

  const invalidDefaults = desk.imported
    ? listInvalidProductDefaults(itemPreset.defaults, desk.pack.rules)
    : [];

  function updateInvalidDefault(item: InvalidProductDefault) {
    if (!item.update) return;
    applyProductDefaultUpdate(item.name, item.update, desk.pack.rules);
  }

  function removeInvalidDefault(item: InvalidProductDefault) {
    removeProductDefault(item.name);
  }

  function updateAllInvalidDefaults() {
    for (const item of invalidDefaults) {
      if (item.update) applyProductDefaultUpdate(item.name, item.update, desk.pack.rules);
    }
  }

  function removeAllInvalidDefaults() {
    for (const item of invalidDefaults) removeProductDefault(item.name);
  }

  const savedRows = storedForStore.map((item) =>
    chartOnScreen(item.issued, item.validUntil) ? withLiveSettings(item) : item,
  );
  const storedRows =
    storeId &&
    desk.imported &&
    desk.pack.chart.issued &&
    desk.pack.chart.validUntil &&
    !savedRows.some((item) => chartOnScreen(item.issued, item.validUntil))
      ? [
          withLiveSettings({
            issued: desk.pack.chart.issued,
            validUntil: desk.pack.chart.validUntil,
            title: desk.pack.chart.title || "Shelf life chart",
            version: desk.pack.chart.version || "",
            hidden: hiddenEntries,
            preset: itemPreset,
            rules: desk.pack.rules,
          }),
          ...savedRows,
        ]
      : savedRows;
  function nameFor(id: string) {
    if (storedDraft?.storeId === id) return storedDraft.storeName;
    return storeNames[id] ?? "";
  }

  function changeStoreName(id: string, value: string) {
    setStoredDraft((draft) =>
      draft && draft.storeId === id
        ? { ...draft, storeName: value.slice(0, 48) }
        : draft,
    );
  }

  function changeStoreDates(id: string, mode: StoreDatesMode) {
    setStoredDraft((draft) =>
      draft && draft.storeId === id
        ? {
            ...draft,
            compactDates: mode === "short",
            showDayCounts: mode === "days",
          }
        : draft,
    );
  }

  function changeStoreList(id: string, mode: StoreListMode) {
    setStoredDraft((draft) =>
      draft && draft.storeId === id
        ? { ...draft, compactList: mode === "compact" }
        : draft,
    );
  }

  function beginStoredEdit() {
    const targetStoreId =
      allStoredOpen && allStoredPreviewId
        ? allStoredPreviewId
        : previewStoreId ?? storeId;
    if (!targetStoreId) return;
    const rows =
      allStoredOpen && allStoredPreviewId
        ? deviceStored.filter((item) => item.storeId === allStoredPreviewId)
        : previewStoreId
          ? previewRows
          : storedRows;
    const viewingOther =
      targetStoreId !== storeId ||
      !!(allStoredOpen && allStoredPreviewId && allStoredPreviewId !== storeId) ||
      !!previewStoreId;
    const campaigns: StoredEditDraft["campaigns"] = {};
    for (const item of rows) {
      const key = campaignKey(item.issued, item.validUntil);
      if (!key) continue;
      const defaults = copyDefaults(item.preset.defaults);
      const hidden = item.hidden.map((entry) => ({ ...entry }));
      campaigns[key] = {
        issued: item.issued,
        validUntil: item.validUntil,
        title: item.title,
        onScreen: !viewingOther && chartOnScreen(item.issued, item.validUntil),
        hidden,
        baselineHidden: hidden.map((entry) => ({ ...entry })),
        defaults,
        baselineDefaults: copyDefaults(defaults),
      };
    }
    const saved = deviceStoreSettings.find((item) => item.storeId === targetStoreId);
    const useLive = !viewingOther;
    const nextCompactDates = useLive ? compactDates : saved?.compactDates === true;
    const nextShowDayCounts = useLive ? debugDays : saved?.showDayCounts === true;
    const nextCompactList = useLive ? compactList : saved?.compactList === true;
    setStoredDraft({
      storeId: targetStoreId,
      storeName: storeNames[targetStoreId] ?? saved?.name ?? "",
      baselineStoreName: storeNames[targetStoreId] ?? saved?.name ?? "",
      compactDates: nextCompactDates,
      baselineCompactDates: nextCompactDates,
      showDayCounts: nextShowDayCounts,
      baselineShowDayCounts: nextShowDayCounts,
      compactList: nextCompactList,
      baselineCompactList: nextCompactList,
      campaigns,
    });
    setStoredConfirmOpen(false);
    setStoredEditing(true);
    setStoreSettingsOpen(true);
    setCampaignPresetsOpen(true);
  }

  function discardStoredEdit() {
    setStoredEditing(false);
    setStoredDraft(null);
    setStoredConfirmOpen(false);
  }

  function resetStoredEdit() {
    setStoredDraft((draft) => {
      if (!draft) return draft;
      const campaigns: StoredEditDraft["campaigns"] = {};
      for (const [key, campaign] of Object.entries(draft.campaigns)) {
        campaigns[key] = {
          ...campaign,
          hidden: campaign.baselineHidden.map((entry) => ({ ...entry })),
          defaults: copyDefaults(campaign.baselineDefaults),
        };
      }
      return {
        ...draft,
        storeName: draft.baselineStoreName,
        compactDates: draft.baselineCompactDates,
        showDayCounts: draft.baselineShowDayCounts,
        compactList: draft.baselineCompactList,
        campaigns,
      };
    });
    setStoredConfirmOpen(false);
  }

  function commitStoredEdit() {
    const draft = storedDraft;
    if (!draft) {
      discardStoredEdit();
      return;
    }
    const storeSettingsChanged =
      draft.storeName !== draft.baselineStoreName ||
      draft.compactDates !== draft.baselineCompactDates ||
      draft.showDayCounts !== draft.baselineShowDayCounts ||
      draft.compactList !== draft.baselineCompactList;
    if (storeSettingsChanged) {
      writeStoreDisplaySettings(draft.storeId, {
        name: draft.storeName,
        compactDates: draft.compactDates,
        showDayCounts: draft.showDayCounts,
        compactList: draft.compactList,
      });
    }
    for (const campaign of Object.values(draft.campaigns)) {
      const remaining = new Set(campaign.hidden.map((entry) => hiddenEntryKey(entry)));
      for (const entry of campaign.baselineHidden) {
        const key = hiddenEntryKey(entry);
        if (remaining.has(key)) continue;
        if (campaign.onScreen) unhideByKey(key);
        else forgetSavedHidden(draft.storeId, campaign.issued, campaign.validUntil, key);
      }
      for (const name of Object.keys(campaign.baselineDefaults)) {
        if (campaign.defaults[name]) continue;
        if (campaign.onScreen) setProductDefault(name, { section: null, life: null });
        else forgetSavedDefault(draft.storeId, campaign.issued, campaign.validUntil, name);
      }
      for (const [name, value] of Object.entries(campaign.defaults)) {
        if (!value.section) continue;
        if (campaign.baselineDefaults[name]?.section === value.section) continue;
        if (campaign.onScreen) {
          setProductDefault(name, { section: value.section }, desk.pack.rules);
        } else {
          writeSavedDefault(
            draft.storeId,
            campaign.issued,
            campaign.validUntil,
            name,
            value.section,
          );
        }
      }
    }
    discardStoredEdit();
  }

  function requestStoredEditConfirm() {
    if (!storedDraft) {
      discardStoredEdit();
      return;
    }
    const changes = listStoredEditChanges(storedDraft);
    if (changes.length === 0) {
      discardStoredEdit();
      return;
    }
    setStoredConfirmOpen(true);
  }

  function toggleStoredEditing() {
    if (storedEditing) requestStoredEditConfirm();
    else beginStoredEdit();
  }

  const storedEditChanges = storedDraft ? listStoredEditChanges(storedDraft) : [];

  function dismissStoredIo() {
    setStoredIo(null);
    setStoredIoChoices([]);
    setStoredIoReviewChoices({});
  }

  function openStoredExport() {
    dismissStoreAction();
    const ids = deviceStoreSettings.map((store) => store.storeId);
    const preferred =
      allStoredPreviewId && ids.includes(allStoredPreviewId)
        ? allStoredPreviewId
        : storeId && ids.includes(storeId)
          ? storeId
          : null;
    setStoredIoChoices(preferred ? [preferred] : [...ids]);
    setStoredIo({ mode: "export" });
  }

  function exportStoredData(storeIds: string[]) {
    if (storeIds.length === 0) return;
    hydrateCampaignLibrary();
    const library = getCampaignLibrary();
    const payload = buildStoredLibraryPayload(library, {
      storeIds,
      storeId: storeIds.length === 1 ? storeIds[0] : undefined,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const nameBit =
      storeIds.length === 1 ? storeIds[0]! : `stores-${storeIds.length}`;
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shelf-life-stored-${nameBit}-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    dismissStoredIo();
    toast.success(
      storeIds.length === 1
        ? `Exported store ${storeIds[0]}.`
        : `Exported ${storeIds.length} stores.`,
    );
  }

  function onStoredImportFile(file: File | null) {
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed = parseStoredLibraryPayload(JSON.parse(text));
        if (!parsed) {
          toast.error("That file is not a Stored data backup.");
          return;
        }
        dismissStoreAction();
        const ids = Object.keys(parsed.library.stores).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        );
        const preferred =
          parsed.storeId && ids.includes(parsed.storeId)
            ? parsed.storeId
            : null;
        setStoredIoChoices(preferred ? [preferred] : [...ids]);
        setStoredIoReviewChoices({});
        setStoredIo({
          mode: "import",
          step: "pick",
          summary: summarizeStoredLibrary(parsed.library),
          library: parsed.library,
          storeId: parsed.storeId,
          reviewIds: [],
          reviewIndex: 0,
        });
      } catch {
        toast.error("Could not read that Stored data file.");
      }
    });
  }

  function beginImportReview(storeIds: string[]) {
    if (!storedIo || storedIo.mode !== "import" || storeIds.length === 0) {
      return;
    }
    const ids = [...storeIds].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    setStoredIoReviewChoices({});
    setStoredIo({
      ...storedIo,
      step: "review",
      reviewIds: ids,
      reviewIndex: 0,
    });
  }

  function importReviewCampaignKey(
    fileLibrary: StoredLibraryPayload["library"],
    forStoreId: string,
  ): string | null {
    const fileStore = fileLibrary.stores[forStoreId];
    const fileKeys = fileStore
      ? Object.keys(fileStore.campaigns).sort((a, b) => {
          const aUntil = a.split("|")[1] ?? "";
          const bUntil = b.split("|")[1] ?? "";
          if (aUntil !== bUntil) return aUntil < bUntil ? 1 : -1;
          return a < b ? 1 : -1;
        })
      : [];
    if (desk.imported) {
      const current = campaignKey(
        desk.pack.chart.issued,
        desk.pack.chart.validUntil,
      );
      if (
        current &&
        (fileKeys.includes(current) ||
          deviceStored.some(
            (item) =>
              item.storeId === forStoreId &&
              campaignKey(item.issued, item.validUntil) === current,
          ))
      ) {
        return current;
      }
    }
    if (fileKeys[0]) return fileKeys[0];
    return autoPreviewCampaignKey(forStoreId);
  }

  function selectionFromCopyChoices(
    choices: string[],
    sourceHiddenKeys: Set<string>,
    sourceDefaultNames: Set<string>,
    campaignKeyValue: string | null,
  ) {
    const hiddenKeys: string[] = [];
    const removeHiddenKeys: string[] = [];
    for (const id of choices) {
      if (!id.startsWith("hidden:")) continue;
      const key = id.slice("hidden:".length);
      if (sourceHiddenKeys.has(key)) hiddenKeys.push(key);
      else removeHiddenKeys.push(key);
    }
    const defaultNames: string[] = [];
    const removeDefaultNames: string[] = [];
    for (const id of choices) {
      if (!id.startsWith("default:")) continue;
      const name = id.slice("default:".length);
      if (sourceDefaultNames.has(name)) defaultNames.push(name);
      else removeDefaultNames.push(name);
    }
    return {
      dates: choices.includes("dates"),
      list: choices.includes("list"),
      campaignKey:
        hiddenKeys.length > 0 ||
        defaultNames.length > 0 ||
        removeHiddenKeys.length > 0 ||
        removeDefaultNames.length > 0
          ? campaignKeyValue
          : null,
      hiddenKeys,
      defaultNames,
      removeHiddenKeys,
      removeDefaultNames,
    };
  }

  function confirmImportReview() {
    if (!storedIo || storedIo.mode !== "import" || storedIo.step !== "review") {
      return;
    }
    const pages = storedIo.reviewIds.flatMap((id) => {
      const choices = storedIoReviewChoices[id] ?? [];
      if (choices.length === 0) return [];
      const fileStore = storedIo.library.stores[id];
      if (!fileStore) return [];
      const campaignKeyValue = importReviewCampaignKey(storedIo.library, id);
      const sourceHiddenKeys = new Set(
        campaignKeyValue && fileStore.campaigns[campaignKeyValue]
          ? fileStore.campaigns[campaignKeyValue]!.hidden.map((entry) =>
              hiddenEntryKey(entry),
            )
          : [],
      );
      const sourceDefaultNames = new Set(
        campaignKeyValue && fileStore.campaigns[campaignKeyValue]
          ? Object.entries(fileStore.campaigns[campaignKeyValue]!.preset.defaults)
              .filter(([, value]) => value.section)
              .map(([name]) => name)
          : [],
      );
      return [
        {
          storeId: id,
          selection: selectionFromCopyChoices(
            choices,
            sourceHiddenKeys,
            sourceDefaultNames,
            campaignKeyValue,
          ),
        },
      ];
    });
    if (pages.length === 0) {
      toast.error("Select something to import.");
      return;
    }
    const ok = importStoredStoreSelections(storedIo.library, pages);
    dismissStoredIo();
    discardStoredEdit();
    if (!ok) {
      toast.error("Nothing was imported.");
      return;
    }
    toast.success(
      pages.length === 1
        ? `Imported into store ${pages[0]!.storeId}.`
        : `Imported into ${pages.length} stores.`,
    );
  }

  function patchStoredCampaign(
    issued: string,
    validUntil: string,
    patch: (campaign: StoredCampaignDraft) => StoredCampaignDraft,
  ) {
    const key = campaignKey(issued, validUntil);
    if (!key) return;
    setStoredDraft((draft) => {
      if (!draft) return draft;
      const campaign = draft.campaigns[key];
      if (!campaign) return draft;
      return {
        ...draft,
        campaigns: { ...draft.campaigns, [key]: patch(campaign) },
      };
    });
  }

  function openStoredProduct(name: string, issued: string, validUntil: string) {
    if (!onOpenProduct) return;
    if (!chartOnScreen(issued, validUntil)) reloadCampaign(issued, validUntil);
    onOpenProduct(name);
  }

  function removeHidden(
    _targetStoreId: string,
    issued: string,
    validUntil: string,
    key: string,
    _onScreen: boolean,
  ) {
    patchStoredCampaign(issued, validUntil, (campaign) => ({
      ...campaign,
      hidden: campaign.hidden.filter((entry) => hiddenEntryKey(entry) !== key),
    }));
  }

  function removeDefault(
    _targetStoreId: string,
    issued: string,
    validUntil: string,
    name: string,
    _onScreen: boolean,
  ) {
    patchStoredCampaign(issued, validUntil, (campaign) => {
      const defaults = { ...campaign.defaults };
      delete defaults[name];
      return { ...campaign, defaults };
    });
  }

  function changeDefault(
    _targetStoreId: string,
    issued: string,
    validUntil: string,
    name: string,
    section: SectionId,
    _onScreen: boolean,
  ) {
    patchStoredCampaign(issued, validUntil, (campaign) => ({
      ...campaign,
      defaults: {
        ...campaign.defaults,
        [name]: { section, life: null },
      },
    }));
  }

  function removeAllHidden(
    _targetStoreId: string,
    issued: string,
    validUntil: string,
    _onScreen: boolean,
  ) {
    patchStoredCampaign(issued, validUntil, (campaign) => ({
      ...campaign,
      hidden: [],
    }));
  }

  function removeAllDefaults(
    _targetStoreId: string,
    issued: string,
    validUntil: string,
    _onScreen: boolean,
  ) {
    patchStoredCampaign(issued, validUntil, (campaign) => ({
      ...campaign,
      defaults: {},
    }));
  }

  const storedDisplayRows = (previewStoreId ? previewRows : storedRows).map((item) => {
    if (!storedDraft) return item;
    const key = campaignKey(item.issued, item.validUntil);
    const campaign = key ? storedDraft.campaigns[key] : undefined;
    if (!campaign) return item;
    return {
      ...item,
      hidden: campaign.hidden,
      preset: { ...item.preset, defaults: campaign.defaults },
    };
  });

  const storeDisplayRow = storedDisplayRows[0];
  const storeDatesLabel = storedDraft
    ? STORE_DATES_LABELS[
        storeDatesMode(storedDraft.compactDates, storedDraft.showDayCounts)
      ]
    : storeDisplayRow
      ? storeDisplayRow.showDayCounts
        ? "Days and hours"
        : storeDisplayRow.compactDates
          ? "Short"
          : "Full"
      : debugDays
        ? "Days and hours"
        : compactDates
          ? "Short"
          : "Full";
  const storeListLabel = storedDraft
    ? STORE_LIST_LABELS[storeListMode(storedDraft.compactList)]
    : storeDisplayRow
      ? storeDisplayRow.compactList
        ? "Compact"
        : "Normal"
      : compactList
        ? "Compact"
        : "Normal";
  const storeDatesValue = storedDraft
    ? storeDatesMode(storedDraft.compactDates, storedDraft.showDayCounts)
    : storeDatesMode(
        storeDisplayRow?.compactDates === true ||
          (!storeDisplayRow && compactDates),
        storeDisplayRow?.showDayCounts === true ||
          (!storeDisplayRow && debugDays),
      );
  const storeListValue = storedDraft
    ? storeListMode(storedDraft.compactList)
    : storeListMode(
        storeDisplayRow?.compactList === true || (!storeDisplayRow && compactList),
      );
  const storeDatesModes: StoreDatesMode[] = debugDays
    ? ["full", "short", "days"]
    : ["full", "short"];

  function syncNavCard(id: SettingsSectionId) {
    const nav = settingsNavRef.current;
    if (!nav) return;
    // App is the first chip. Centering it cannot scroll back to the start,
    // and a smooth scroll still in flight from the section below leaves the row offset.
    if (id === SETTINGS_SECTION_IDS[0]) {
      if (nav.scrollLeft <= 1) return;
      nav.scrollTo({ left: 0, behavior: "auto" });
      return;
    }
    const chip = nav.querySelector<HTMLElement>(
      `button[data-settings-nav="${id}"]`,
    );
    if (!chip) return;
    const navRect = nav.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta =
      chipRect.left +
      chipRect.width / 2 -
      (navRect.left + navRect.width / 2);
    if (Math.abs(delta) < 2) return;
    nav.scrollBy({ left: delta, behavior: "smooth" });
  }

  function sectionAtScroll(body: HTMLElement): SettingsSectionId {
    const bodyRect = body.getBoundingClientRect();
    // Active section = the one whose top has crossed a line near the top of the pane.
    const marker = bodyRect.top + Math.min(56, bodyRect.height * 0.25);
    let current: SettingsSectionId = SETTINGS_SECTION_IDS[0];
    let bestTop = Number.NEGATIVE_INFINITY;
    for (const id of SETTINGS_SECTION_IDS) {
      const el = body.querySelector<HTMLElement>(`#${id}`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= marker && top >= bestTop) {
        bestTop = top;
        current = id;
      }
    }
    return current;
  }

  function applyActiveSection(id: SettingsSectionId) {
    setActiveSettingsSection((prev) => {
      if (prev === id) return prev;
      requestAnimationFrame(() => syncNavCard(id));
      return id;
    });
  }

  function jumpToSection(id: SettingsSectionId) {
    const body = settingsBodyRef.current;
    const target = body?.querySelector<HTMLElement>(`#${id}`);
    if (!body || !target) return;
    settingsJumpLock.current = true;
    applyActiveSection(id);
    syncNavCard(id);
    const top =
      target.getBoundingClientRect().top -
      body.getBoundingClientRect().top +
      body.scrollTop;
    body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    if (settingsJumpTimer.current != null) {
      window.clearTimeout(settingsJumpTimer.current);
    }
    settingsJumpTimer.current = window.setTimeout(() => {
      settingsJumpLock.current = false;
      settingsJumpTimer.current = null;
      applyActiveSection(sectionAtScroll(body));
    }, 650);
  }

  function measureSettingsEndPad(body: HTMLElement): number {
    const last = body.querySelector<HTMLElement>("#settings-system");
    if (!last || body.clientHeight <= 0) return 0;
    // Pane is a fixed viewport — pad so System's top can sit at the pane top.
    return Math.max(0, Math.round(body.clientHeight - last.offsetHeight));
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let body: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function syncEndPad() {
      if (!body) return;
      const next = measureSettingsEndPad(body);
      setSettingsEndPad((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    }

    function onScroll() {
      if (!body || settingsJumpLock.current) return;
      applyActiveSection(sectionAtScroll(body));
    }

    function attach() {
      if (cancelled) return false;
      body = settingsBodyRef.current;
      if (!body) return false;
      body.addEventListener("scroll", onScroll, { passive: true });
      resizeObserver = new ResizeObserver(() => {
        syncEndPad();
        onScroll();
      });
      resizeObserver.observe(body);
      const system = body.querySelector("#settings-system");
      if (system) resizeObserver.observe(system);
      syncEndPad();
      requestAnimationFrame(() => {
        if (!cancelled) syncEndPad();
      });
      onScroll();
      return true;
    }

    let retryTimer: number | null = null;
    const raf = window.requestAnimationFrame(() => {
      if (attach()) return;
      retryTimer = window.setTimeout(() => {
        attach();
      }, 80);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      body?.removeEventListener("scroll", onScroll);
    };
  }, [open, hiddenNames.length, debug, desk.imported, desk.pack.rules.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const body = settingsBodyRef.current;
    if (!body) return;
    const next = measureSettingsEndPad(body);
    if (Math.abs(settingsEndPad - next) >= 1) setSettingsEndPad(next);
  }, [open, settingsEndPad, debug, desk.imported, desk.pack.rules.length]);

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25",
              compact ? "size-8" : "size-11",
            )}
            aria-label="Settings"
          />
        }
      >
        <Settings className={compact ? "size-4" : "size-5"} />
      </DialogTrigger>
      <DialogContent
        className="top-[max(0.5rem,env(safe-area-inset-top))]! flex h-[calc(100dvh-max(0.5rem,env(safe-area-inset-top))-0.5rem)] max-h-[calc(100dvh-max(0.5rem,env(safe-area-inset-top))-0.5rem)] w-[calc(100%-1.25rem)] max-w-md translate-y-0! flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md"
        showCloseButton={false}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden transition-[filter]",
            allStoredOpen &&
              "pointer-events-none blur-[2.5px] brightness-75 saturate-75",
          )}
          inert={allStoredOpen ? true : undefined}
          aria-hidden={allStoredOpen || undefined}
        >
        <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3 pr-14">
          <DialogTitle className="font-display text-2xl text-white">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Store, import, display, debug, and system.
          </DialogDescription>
          <button
            type="button"
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </DialogHeader>

        <nav
          aria-label="Settings sections"
          className="shrink-0 border-b border-white/10 bg-popover px-3 py-2.5"
        >
          <div
            ref={settingsNavRef}
            className="flex items-center gap-2 overflow-x-auto scroll-px-2 px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-popover pr-0.5">
              <Select
                value={activeSettingsSection}
                items={settingsSelectLabels}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    jumpToSection(value as SettingsSectionId);
                  }
                }}
              >
                <SelectTrigger
                  aria-label={`Current section: ${activeSettingsLabel}`}
                  className="h-auto max-w-[9.5rem] gap-1 rounded-xl border-sky-400/50 bg-sky-500/20 px-3.5 py-2 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)] hover:bg-sky-500/25 focus-visible:border-sky-400/60 focus-visible:ring-sky-400/30 data-popup-open:relative data-popup-open:z-[101] data-popup-open:rounded-b-none data-popup-open:border-b-0 data-popup-open:shadow-none dark:bg-sky-500/20 dark:hover:bg-sky-500/25 [&_svg]:size-3.5 [&_svg]:text-sky-300 data-popup-open:[&_svg]:rotate-180 [&_[data-slot=select-value]]:text-[0.65rem] [&_[data-slot=select-value]]:font-semibold [&_[data-slot=select-value]]:tracking-[0.14em] [&_[data-slot=select-value]]:uppercase"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  sideOffset={0}
                  alignItemWithTrigger={false}
                  className="w-max min-w-(--anchor-width) rounded-t-none rounded-b-xl border-sky-400/50 border-t-0 bg-popover p-1 shadow-[0_0_0_1px_rgba(56,189,248,0.25)] ring-0"
                >
                  {settingsNav.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      className="text-[0.7rem] font-semibold tracking-[0.12em] uppercase"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span
                aria-hidden
                className="h-5 w-px shrink-0 bg-white/15"
              />
            </div>
            {settingsNav.map((item) => {
              const selected = activeSettingsSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-settings-nav={item.id}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => jumpToSection(item.id)}
                  className={cn(
                    "shrink-0 rounded-xl border px-3.5 py-2 text-left transition-[background-color,border-color,box-shadow,color] duration-200",
                    selected
                      ? "border-sky-400/50 bg-sky-500/20 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
                      : "border-white/10 bg-card text-stone-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-stone-200",
                  )}
                >
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div
          ref={settingsBodyRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-0"
        >
          <div className="flex flex-col gap-3">
          <section
            id="settings-app"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-app"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>App</SettingsSectionTitle>
            <div className="space-y-2">
              <label htmlFor="store-id" className="text-sm font-medium text-stone-300">
                Store ID
              </label>
              <div className="flex gap-2">
                <div ref={storeFieldRef} className="relative min-w-0 flex-1">
                  <div className="relative">
                    <Input
                      id="store-id"
                      inputMode="numeric"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={12}
                      placeholder={storeId || "12345"}
                      value={storeDraft}
                      aria-invalid={storeIdError ? true : undefined}
                      aria-expanded={storedStoreIds.length > 0 ? storeMenuOpen : undefined}
                      aria-controls={storeMenuVisible ? "store-id-list" : undefined}
                      aria-autocomplete={storedStoreIds.length > 0 ? "list" : undefined}
                      onChange={(event) => {
                        setStoreDraft(event.target.value);
                        setStoreMenuAll(false);
                        if (storeIdError) setStoreIdError(null);
                        if (storedStoreIds.length > 0) {
                          setStoreMenuOpen(true);
                          requestAnimationFrame(syncStoreMenuPos);
                        }
                      }}
                      onFocus={() => {
                        if (storedStoreIds.length > 0) {
                          setStoreMenuAll(false);
                          setStoreMenuOpen(true);
                          syncStoreMenuPos();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && storeMenuOpen) {
                          event.preventDefault();
                          setStoreMenuOpen(false);
                          setStoreMenuAll(false);
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitStoreDraft();
                        }
                      }}
                      className={cn(
                        "h-12 rounded-xl border-white/10 bg-black/30 text-base text-white placeholder:text-stone-500",
                        showStoreClear && storedStoreIds.length > 0
                          ? "pr-[5.25rem]"
                          : showStoreClear || storedStoreIds.length > 0
                            ? "pr-11"
                            : null,
                      )}
                    />
                    {showStoreClear || storedStoreIds.length > 0 ? (
                      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
                        {showStoreClear ? (
                          <button
                            type="button"
                            aria-label="Clear store ID"
                            disabled={storePrompt != null}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setStoreDraft("");
                              setStoreIdError(null);
                              if (storedStoreIds.length > 0) {
                                setStoreMenuAll(false);
                                setStoreMenuOpen(true);
                                syncStoreMenuPos();
                              } else {
                                setStoreMenuOpen(false);
                                setStoreMenuAll(false);
                              }
                            }}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-stone-300 disabled:opacity-40"
                          >
                            <X className="size-4" aria-hidden />
                          </button>
                        ) : null}
                        {storedStoreIds.length > 0 ? (
                          <button
                            type="button"
                            aria-label="Show stored store IDs"
                            aria-expanded={storeMenuOpen && storeMenuAll}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              if (storeMenuOpen && storeMenuAll) {
                                setStoreMenuOpen(false);
                                setStoreMenuAll(false);
                                return;
                              }
                              setStoreMenuAll(true);
                              setStoreMenuOpen(true);
                              syncStoreMenuPos();
                            }}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-stone-300"
                          >
                            <ChevronDown
                              className={cn(
                                "size-4 transition-transform",
                                storeMenuOpen && storeMenuAll && "rotate-180",
                              )}
                              aria-hidden
                            />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {storeMenuVisible && storeMenuPos
                    ? createPortal(
                        <div
                          data-base-ui-portal=""
                          style={{
                            position: "fixed",
                            top: storeMenuPos.top,
                            left: storeMenuPos.left,
                            width: storeMenuPos.width,
                            zIndex: 110,
                          }}
                        >
                          <ul
                            ref={storeMenuListRef}
                            id="store-id-list"
                            role="listbox"
                            aria-label="Stored store IDs"
                            className="max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-popover py-1 shadow-lg shadow-black/40 ring-1 ring-white/10"
                          >
                            {menuStoreIds.length === 0 ? (
                              <li className="px-3 py-2.5 text-sm text-stone-500">
                                No matching stores
                              </li>
                            ) : (
                              menuStoreIds.map((id) => {
                                const selected = id === storeDraft;
                                return (
                                  <li key={id}>
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      onMouseDown={(event) =>
                                        event.preventDefault()
                                      }
                                      onClick={() => {
                                        setStoreDraft(id);
                                        setStoreIdError(null);
                                        setStoreMenuOpen(false);
                                        setStoreMenuAll(false);
                                      }}
                                      className={cn(
                                        "flex h-11 w-full items-center gap-2 px-3 text-left text-base text-white",
                                        selected
                                          ? "bg-sky-500/20"
                                          : "hover:bg-white/[0.06]",
                                      )}
                                    >
                                      <span className="shrink-0 font-mono">
                                        {id}
                                      </span>
                                      {storeNames[id] ? (
                                        <span className="min-w-0 truncate text-sm text-stone-300">
                                          {storeNames[id]}
                                        </span>
                                      ) : null}
                                    </button>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        </div>,
                        // Nest inside the Settings dialog portal so the modal
                        // does not mark the list inert / aria-hidden.
                        storeFieldRef.current?.closest("[data-base-ui-portal]") ??
                          document.body,
                      )
                    : null}
                </div>
                <Button
                  type="button"
                  className="h-12 shrink-0 rounded-xl px-3"
                  disabled={normalizeStoreId(storeDraft) === storeId || storePrompt != null}
                  onClick={commitStoreDraft}
                >
                  Confirm
                </Button>
              </div>
              <p className={cn("text-xs", storeIdError ? "text-red-300" : "text-stone-500")}>
                {storeIdError
                  ? storeIdError
                  : storeId
                    ? `Store ${storeId}. Confirm loads the date display, hidden items, and product defaults saved for a store on this device.`
                    : "Number for this store. Load a stored store, then confirm."}
              </p>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
              {invalidDefaults.length > 0 ? (
                <InvalidDefaultsWarning
                  items={invalidDefaults}
                  onUpdate={updateInvalidDefault}
                  onRemove={removeInvalidDefault}
                  onUpdateAll={updateAllInvalidDefaults}
                  onRemoveAll={removeAllInvalidDefaults}
                />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-stone-300">Stored data</p>
                  <button
                    type="button"
                    disabled={storedEditing}
                    onClick={() => {
                      setAllStoredPreviewId(null);
                      setAllStoredPreviewCampaignKey(null);
                      dismissStoreAction();
                      setAllStoredOpen(true);
                    }}
                    className="shrink-0 text-xs font-semibold text-sky-300 underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    Show all
                  </button>
                </div>
                {previewStoreId ?? storeId ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {storedEditing ? (
                      <button
                        type="button"
                        disabled={storedEditChanges.length === 0}
                        onClick={resetStoredEdit}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-200 ring-1 ring-white/15 disabled:opacity-40"
                      >
                        Reset
                      </button>
                    ) : null}
                    <StoredEditButton editing={storedEditing} onToggle={toggleStoredEditing} />
                  </div>
                ) : null}
              </div>
              {previewStoreId ?? storeId ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    aria-expanded={storeSettingsOpen}
                    onClick={() => setStoreSettingsOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Store settings
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-stone-400 transition-transform",
                        storeSettingsOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {storeSettingsOpen ? (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                      {storedEditing ? (
                        <StoreNameField
                          value={nameFor(previewStoreId ?? storeId)}
                          onChange={(value) =>
                            changeStoreName(previewStoreId ?? storeId, value)
                          }
                        />
                      ) : (
                        <div className="space-y-0.5">
                          <p className="text-xs text-stone-500">Name</p>
                          <p className="truncate text-sm text-stone-200">
                            {nameFor(previewStoreId ?? storeId) || "Not set"}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {storedEditing ? (
                          <>
                            <label className="block min-w-0 space-y-1">
                              <span className="text-xs text-stone-500">Dates</span>
                              <Select
                                value={storeDatesValue}
                                items={STORE_DATES_LABELS}
                                onValueChange={(value) => {
                                  if (value === "full" || value === "short") {
                                    changeStoreDates(previewStoreId ?? storeId, value);
                                  } else if (value === "days" && debugDays) {
                                    changeStoreDates(previewStoreId ?? storeId, value);
                                  }
                                }}
                              >
                                <SelectTrigger
                                  aria-label="Dates display"
                                  className="h-11 w-full min-w-0 rounded-xl border-white/10 bg-black/30 px-3 text-white hover:bg-black/40 focus-visible:border-white/20 focus-visible:ring-white/15 dark:bg-black/30 [&_svg]:text-stone-400"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent
                                  align="start"
                                  alignItemWithTrigger={false}
                                  className="rounded-xl border-white/10 bg-popover p-1"
                                >
                                  {storeDatesModes.map((mode) => (
                                    <SelectItem key={mode} value={mode}>
                                      {STORE_DATES_LABELS[mode]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                            <label className="block min-w-0 space-y-1">
                              <span className="text-xs text-stone-500">List</span>
                              <Select
                                value={storeListValue}
                                items={STORE_LIST_LABELS}
                                onValueChange={(value) => {
                                  if (value === "tags" || value === "compact") {
                                    changeStoreList(previewStoreId ?? storeId, value);
                                  }
                                }}
                              >
                                <SelectTrigger
                                  aria-label="List display"
                                  className="h-11 w-full min-w-0 rounded-xl border-white/10 bg-black/30 px-3 text-white hover:bg-black/40 focus-visible:border-white/20 focus-visible:ring-white/15 dark:bg-black/30 [&_svg]:text-stone-400"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent
                                  align="start"
                                  alignItemWithTrigger={false}
                                  className="rounded-xl border-white/10 bg-popover p-1"
                                >
                                  {(
                                    Object.keys(STORE_LIST_LABELS) as StoreListMode[]
                                  ).map((mode) => (
                                    <SelectItem key={mode} value={mode}>
                                      {STORE_LIST_LABELS[mode]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          </>
                        ) : (
                          <>
                            <div className="space-y-0.5">
                              <p className="text-xs text-stone-500">Dates</p>
                              <p className="text-sm text-stone-200">{storeDatesLabel}</p>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-xs text-stone-500">List</p>
                              <p className="text-sm text-stone-200">{storeListLabel}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!(previewStoreId ?? storeId) ? (
                <p className="text-xs text-stone-500">
                  Set a store ID to see store settings and campaign presets saved for it.
                </p>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    aria-expanded={campaignPresetsOpen}
                    onClick={() => setCampaignPresetsOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Campaign presets
                      {storedDisplayRows.length > 0
                        ? ` · ${storedDisplayRows.length}`
                        : ""}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-stone-400 transition-transform",
                        campaignPresetsOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {campaignPresetsOpen ? (
                    storedDisplayRows.length === 0 ? (
                      <p className="text-xs text-stone-500">
                        No campaign presets saved for store{" "}
                        {previewStoreId ?? storeId} yet.
                      </p>
                    ) : (
                      storedDisplayRows.map((item) => {
                    const onScreen = !previewStoreId && chartOnScreen(item.issued, item.validUntil);
                    return (
                      <article
                        key={`${item.issued}|${item.validUntil}`}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-white">
                            {item.title}
                          </p>
                          {onScreen ? (
                            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-300">
                              On screen
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400">
                          Issued {formatShortDate(item.issued)} · Valid until{" "}
                          {formatShortDate(item.validUntil)}
                          {item.version ? ` · Version ${item.version}` : ""}
                        </p>
                        <StoredCampaignDetails
                          item={item}
                          editing={storedEditing}
                          showStoreDisplay={false}
                          invalidDefaults={onScreen ? invalidDefaults : []}
                          onOpenHidden={(entry) =>
                            openStoredProduct(entry.name, item.issued, item.validUntil)
                          }
                          onRemoveHidden={(entry) =>
                            removeHidden(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              hiddenEntryKey(entry),
                              onScreen,
                            )
                          }
                          onRemoveDefault={(name) =>
                            removeDefault(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              name,
                              onScreen,
                            )
                          }
                          onChangeDefault={(name, section) =>
                            changeDefault(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              name,
                              section,
                              onScreen,
                            )
                          }
                          onUpdateInvalidDefault={(name) => {
                            const hit = invalidDefaults.find((row) => row.name === name);
                            if (hit) updateInvalidDefault(hit);
                          }}
                          onRemoveAllHidden={() =>
                            removeAllHidden(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              onScreen,
                            )
                          }
                          onRemoveAllDefaults={() =>
                            removeAllDefaults(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              onScreen,
                            )
                          }
                        />
                      </article>
                    );
                      })
                    )
                  ) : null}
                </div>
              )}
            </div>
          </section>
          <section
            id="settings-chart"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-chart"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Import</SettingsSectionTitle>
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-300">Saved charts</p>
              {campaigns.length === 0 ? (
                <p className="text-xs text-stone-500">
                  Imported charts are kept here with their issued and valid dates.
                </p>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((item) => {
                    const loaded =
                      desk.imported &&
                      desk.pack.chart.issued === item.issued &&
                      desk.pack.chart.validUntil === item.validUntil;
                    const issuedLabel = formatShortDate(item.issued);
                    const validLabel = formatShortDate(item.validUntil);
                    return (
                      <button
                        key={`${item.issued}|${item.validUntil}`}
                        type="button"
                        aria-pressed={loaded}
                        aria-label={`${item.title || "Shelf life chart"}, issued ${issuedLabel}, valid until ${validLabel}${loaded ? ", loaded" : ""}`}
                        disabled={busy}
                        onClick={() => reloadCampaign(item.issued, item.validUntil)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2.5 text-left",
                          loaded
                            ? "border-sky-400/50 bg-sky-500/15"
                            : "border-white/10 bg-black/20 hover:border-white/20",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-white">
                            {item.title || "Shelf life chart"}
                          </span>
                          {loaded ? (
                            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-300">
                              Loaded
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-400">
                          Issued {issuedLabel} · Valid until {validLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readQrFromImage(file);
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                try {
                  const result = await parsePdfChartFile(file);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  await commitPack(result.pack, file.name, result.crops);
                } catch {
                  toast.error("Could not read that PDF.");
                } finally {
                  setBusy(false);
                }
              }}
            />

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-xl border-white/10 text-sm text-white"
                disabled={busy}
                onClick={() => photoRef.current?.click()}
              >
                <ImageUp className="size-4" />
                Camera
              </Button>
              {!scanning ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-start rounded-xl border-white/10 text-sm text-white"
                  disabled={busy}
                  onClick={startScan}
                >
                  <QrCode className="size-4" />
                  Scan QR
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-start rounded-xl border-white/10 text-sm text-white"
                  onClick={stopScan}
                >
                  <Camera className="size-4" />
                  Stop cam
                </Button>
              )}
            </div>

            {scanning ? (
              <div className="overflow-hidden rounded-2xl bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[3/4] w-full object-cover"
                  muted
                  playsInline
                />
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="size-4" />
              PDF chart
            </Button>

            <div className="space-y-2">
              <label htmlFor="chart-url" className="text-sm font-medium text-stone-300">
                Google Drive link
              </label>
              <div className="flex gap-2">
                <Input
                  id="chart-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="https://drive.google.com/file/d/…"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="h-12 rounded-xl border-white/10 bg-black/30 text-base text-white placeholder:text-stone-500"
                />
                <Button
                  type="button"
                  className="h-12 shrink-0 rounded-xl px-3"
                  disabled={busy || !url.trim()}
                  onClick={() => importFromUrl(url)}
                >
                  <Link2 className="size-4" />
                  Load
                </Button>
              </div>
              <p className="text-xs text-stone-500">
                Share the PDF as “Anyone with the link”, then paste that link or put it
                in a QR code.
              </p>
            </div>

            {desk.imported ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw className="size-4" />
                Reset chart
              </Button>
            ) : null}
          </section>

          <section
            id="settings-display"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-display"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Display</SettingsSectionTitle>
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-400">
                <Type className="size-3.5 opacity-80" aria-hidden />
                Text size
              </p>
              <div
                role="group"
                aria-label="Text size"
                className="grid grid-cols-3 gap-2"
              >
                {TEXT_SIZE_OPTIONS.map(({ id, label }) => {
                  const active = textSize === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTextSize(id)}
                      className={cn(
                        "flex h-12 flex-col items-center justify-center rounded-xl border font-medium text-white",
                        id === "sm" && "text-xs",
                        id === "md" && "text-sm",
                        id === "lg" && "text-base",
                        active
                          ? "border-sky-400/50 bg-sky-500/20"
                          : "border-white/10 bg-card text-stone-300",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-stone-500">
                Scales product names, dates, and chips on the desk.
              </p>
            </div>
            <div
              role="group"
              aria-label="Preferred orientation"
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  {
                    id: "portrait" as const,
                    label: "Portrait",
                    Icon: RectangleVertical,
                  },
                  {
                    id: "landscape" as const,
                    label: "Landscape",
                    Icon: RectangleHorizontal,
                  },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = rotation.orientation === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreferredOrientation(id)}
                    className={cn(
                      "flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium text-white",
                      active
                        ? "border-sky-400/50 bg-sky-500/20"
                        : "border-white/10 bg-card text-stone-300",
                    )}
                  >
                    <Icon className="size-4 opacity-80" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rotation.locked}
              aria-label={
                rotation.locked
                  ? `Unlock ${rotation.orientation} view`
                  : `Lock to ${rotation.orientation} view`
              }
              onClick={() => setRotationLocked(!rotation.locked)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                rotation.locked
                  ? "border-emerald-400/40 bg-emerald-500/15"
                  : "border-white/10 bg-card",
              )}
            >
              <span className="inline-flex items-center gap-2">
                {rotation.locked ? (
                  <Lock className="size-4 opacity-80" aria-hidden />
                ) : (
                  <Unlock className="size-4 opacity-80" aria-hidden />
                )}
                {rotation.locked ? "Locked to view" : "Lock to this view"}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  rotation.locked ? "text-emerald-300" : "text-stone-500",
                )}
              >
                {rotation.locked ? "On" : "Off"}
              </span>
            </button>
            <p className="text-xs text-stone-500">
              Pick portrait or landscape, then lock so phones stay in that view. Wide
              desktops never rotate.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={keepAwake}
              aria-label={
                keepAwake ? "Allow the screen to sleep" : "Keep the screen on"
              }
              onClick={() => setKeepAwake(!keepAwake)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                keepAwake
                  ? "border-emerald-400/40 bg-emerald-500/15"
                  : "border-white/10 bg-card",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Sun className="size-4 opacity-80" aria-hidden />
                Keep screen on
              </span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  keepAwake ? "text-emerald-300" : "text-stone-500",
                )}
              >
                {keepAwake ? "On" : "Off"}
              </span>
            </button>
            <p className="text-xs text-stone-500">
              Stops the phone sleeping while this tab is open. Turn off to save
              battery. Needs a modern browser (Chrome / Edge / installed app).
            </p>
          </section>

          <section
            id="settings-debug"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-debug"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Debug</SettingsSectionTitle>
            <button
              type="button"
              role="switch"
              aria-checked={debugDays}
              aria-label="Show number of days instead of expiry dates"
              onClick={() => writeDebugDays(!debugDays)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                debugDays
                  ? "border-sky-400/40 bg-sky-500/15"
                  : "border-white/10 bg-card",
              )}
            >
              <span>Show days/hours instead of dates</span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  debugDays ? "text-sky-300" : "text-stone-500",
                )}
              >
                {debugDays ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={debug}
              aria-label="Show text conversion table"
              onClick={() => writeDebug(!debug)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                debug ? "border-sky-400/40 bg-sky-500/15" : "border-white/10 bg-card",
              )}
            >
              <span>Text conversion table</span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  debug ? "text-sky-300" : "text-stone-500",
                )}
              >
                {debug ? "On" : "Off"}
              </span>
            </button>
            {debug ? <TextConvertTable desk={desk} /> : null}
          </section>

          <section
            id="settings-system"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-system"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>System</SettingsSectionTitle>
            <dl className="space-y-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone-500">Name</dt>
                <dd className="text-right font-medium text-stone-100">
                  Domino&apos;s Stock Shelf Life
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone-500">Version</dt>
                <dd className="font-mono text-right text-stone-200">
                  {appVersionLabel()}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone-500">Chart</dt>
                <dd className="text-right text-stone-200">
                  {desk.imported
                    ? `${desk.pack.rules.length} items loaded`
                    : "None loaded"}
                </dd>
              </div>
              {desk.imported && desk.pack.chart.title ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-stone-500">Chart title</dt>
                  <dd className="max-w-[60%] text-right text-stone-200 [overflow-wrap:anywhere]">
                    {desk.pack.chart.title}
                  </dd>
                </div>
              ) : null}
              {desk.imported && desk.pack.chart.version ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-stone-500">Chart version</dt>
                  <dd className="text-right text-stone-200">
                    {desk.pack.chart.version}
                  </dd>
                </div>
              ) : null}
              {desk.imported && desk.pack.chart.validUntil ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-stone-500">Valid until</dt>
                  <dd className="text-right text-stone-200">
                    {formatCompactDate(desk.pack.chart.validUntil)}
                  </dd>
                </div>
              ) : null}
              {desk.imported && desk.sourceUrl ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-stone-500">Source</dt>
                  <dd className="max-w-[65%] truncate text-right text-xs text-stone-400">
                    {desk.sourceUrl}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="text-xs leading-relaxed text-stone-500">
              Checks the hosted build against this install. If a newer version
              is available, the app reloads to pick it up. Chart data on this
              device is kept.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              onClick={() => setChangelogOpen(true)}
            >
              <ScrollText className="size-4" />
              Changelog
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                const toastId = toast.loading("Checking for updates…");
                void getAppUpdateInfo()
                  .then((info) => {
                    toast.dismiss(toastId);
                    if (info.available && info.remoteVersion) {
                      setPendingUpdate({
                        localVersion: info.localVersion,
                        remoteVersion: info.remoteVersion,
                        notes: info.remoteNotes,
                      });
                      setUpdateConfirmOpen(true);
                      return;
                    }
                    return reloadAppToLatest().finally(() => setOpen(false));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <RefreshCw className="size-4" />
              Check for updates
            </Button>
          </section>
          </div>
          <div
            data-settings-end-pad
            aria-hidden
            className="pointer-events-none shrink-0"
            style={{ height: settingsEndPad }}
          />
        </div>
        </div>

        {allStoredOpen ? (
          <div className="absolute inset-0 z-50 flex flex-col">
            <button
              type="button"
              className="absolute inset-0 z-0 bg-black/45"
              aria-label="Dismiss all stored data"
              onClick={() => {
                if (storeAction) {
                  dismissStoreAction();
                  return;
                }
                if (storedIo) {
                  dismissStoredIo();
                  return;
                }
                setAllStoredOpen(false);
                setAllStoredPreviewId(null);
                setAllStoredPreviewCampaignKey(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="all-stored-title"
              className={cn(
                "relative z-10 mt-[3.75rem] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-popover shadow-2xl ring-1 ring-foreground/10 transition-[filter]",
                (storeAction || storeActionClickGuard || storedIo) &&
                  "pointer-events-none",
                (storeAction || storedIo) &&
                  "blur-[2.5px] brightness-75 saturate-75",
              )}
              inert={
                storeAction || storeActionClickGuard || storedIo
                  ? true
                  : undefined
              }
              aria-hidden={storeAction || storedIo ? true : undefined}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {(() => {
                const previewStore = allStoredPreviewId
                  ? deviceStoreSettings.find(
                      (store) => store.storeId === allStoredPreviewId,
                    )
                  : null;
                const previewCampaignsRaw = allStoredPreviewId
                  ? deviceStored.filter(
                      (item) => item.storeId === allStoredPreviewId,
                    )
                  : [];
                const previewCampaigns = previewCampaignsRaw.map((item) => {
                  if (
                    !storedDraft ||
                    storedDraft.storeId !== allStoredPreviewId
                  ) {
                    return item;
                  }
                  const key = campaignKey(item.issued, item.validUntil);
                  const campaign = key ? storedDraft.campaigns[key] : undefined;
                  if (!campaign) return item;
                  return {
                    ...item,
                    hidden: campaign.hidden,
                    preset: { ...item.preset, defaults: campaign.defaults },
                  };
                });
                const storeSelectItems = Object.fromEntries(
                  deviceStoreSettings.map((store) => [
                    store.storeId,
                    store.storeId,
                  ]),
                );
                const storeSelectMenuLabel = (id: string) => {
                  const store = deviceStoreSettings.find(
                    (entry) => entry.storeId === id,
                  );
                  const label = nameFor(id) || store?.name || "";
                  return label ? `${id} · ${label}` : id;
                };
                const editingPreview =
                  !!previewStore &&
                  storedEditing &&
                  storedDraft?.storeId === previewStore.storeId;
                const previewDatesLabel = editingPreview
                  ? STORE_DATES_LABELS[
                      storeDatesMode(
                        storedDraft.compactDates,
                        storedDraft.showDayCounts,
                      )
                    ]
                  : previewStore
                    ? previewStore.showDayCounts
                      ? "Days and hours"
                      : previewStore.compactDates
                        ? "Short"
                        : "Full"
                    : "";
                const previewListLabel = editingPreview
                  ? STORE_LIST_LABELS[storeListMode(storedDraft.compactList)]
                  : previewStore
                    ? previewStore.compactList
                      ? "Compact"
                      : "Normal"
                    : "";
                const previewDatesValue = editingPreview
                  ? storeDatesMode(
                      storedDraft.compactDates,
                      storedDraft.showDayCounts,
                    )
                  : storeDatesMode(
                      previewStore?.compactDates === true,
                      previewStore?.showDayCounts === true,
                    );
                const previewListValue = editingPreview
                  ? storeListMode(storedDraft.compactList)
                  : storeListMode(previewStore?.compactList === true);
                const campaignSelectItems = Object.fromEntries(
                  previewCampaigns.flatMap((item) => {
                    const key = campaignKey(item.issued, item.validUntil);
                    return key ? [[key, item.title] as const] : [];
                  }),
                );
                const selectedCampaign =
                  allStoredPreviewCampaignKey &&
                  campaignSelectItems[allStoredPreviewCampaignKey]
                    ? previewCampaigns.find(
                        (item) =>
                          campaignKey(item.issued, item.validUntil) ===
                          allStoredPreviewCampaignKey,
                      )
                    : null;
                const selectedCampaignOnScreen =
                  !!selectedCampaign &&
                  previewStore?.storeId === storeId &&
                  chartOnScreen(
                    selectedCampaign.issued,
                    selectedCampaign.validUntil,
                  );

                return (
                  <>
                    <div className="relative shrink-0 space-y-2 border-b border-white/10 px-4 py-3 pr-14">
                      <div className="flex h-9 items-center gap-2 pr-1">
                        {previewStore ? (
                          <>
                            <Select
                              value={previewStore.storeId}
                              items={storeSelectItems}
                              onValueChange={(value) => {
                                if (typeof value === "string" && value) {
                                  setAllStoredPreviewId(value);
                                  setAllStoredPreviewCampaignKey(
                                    autoPreviewCampaignKey(value),
                                  );
                                  setStoreDraft(value);
                                }
                              }}
                            >
                              <SelectTrigger
                                id="all-stored-title"
                                aria-label="Preview store"
                                className="h-9 min-w-0 flex-1 gap-1.5 rounded-lg border-0 bg-transparent px-0 py-0 text-left text-white shadow-none hover:bg-transparent focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-stone-400 [&_[data-slot=select-value]]:font-display [&_[data-slot=select-value]]:text-xl [&_[data-slot=select-value]]:font-medium [&_[data-slot=select-value]]:leading-none"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent
                                align="start"
                                alignItemWithTrigger={false}
                                className="z-[120] max-w-[min(24rem,calc(100vw-2.5rem))] rounded-xl border-white/10 bg-popover p-1"
                              >
                                {deviceStoreSettings.map((store) => (
                                  <SelectItem
                                    key={store.storeId}
                                    value={store.storeId}
                                  >
                                    {storeSelectMenuLabel(store.storeId)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              aria-label="Back to store list"
                              onClick={() => {
                                setAllStoredPreviewId(null);
                                setAllStoredPreviewCampaignKey(null);
                              }}
                              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-stone-200 ring-1 ring-white/15"
                            >
                              <X className="size-3.5" aria-hidden />
                              Clear
                            </button>
                          </>
                        ) : (
                          <h2
                            id="all-stored-title"
                            className="flex h-9 min-w-0 flex-1 items-center font-display text-xl font-medium leading-none text-white"
                          >
                            All stored data
                          </h2>
                        )}
                      </div>
                      <p className="min-h-10 text-sm leading-5 text-stone-400">
                        {previewStore
                          ? "Preview this store's settings and campaign presets."
                          : "Store settings saved on this device. Tap a card to preview."}
                      </p>
                      <div className="-mr-11 flex items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openStoredExport}
                            disabled={deviceStoreSettings.length === 0}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-200 ring-1 ring-white/15 disabled:opacity-40"
                          >
                            Export
                          </button>
                          <button
                            type="button"
                            onClick={() => storedImportInputRef.current?.click()}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-200 ring-1 ring-white/15"
                          >
                            Import
                          </button>
                          <input
                            ref={storedImportInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              event.target.value = "";
                              onStoredImportFile(file);
                            }}
                          />
                        </div>
                        {previewStore ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {storedEditing &&
                            storedDraft?.storeId === previewStore.storeId ? (
                              <button
                                type="button"
                                disabled={storedEditChanges.length === 0}
                                onClick={resetStoredEdit}
                                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-200 ring-1 ring-white/15 disabled:opacity-40"
                              >
                                Reset
                              </button>
                            ) : null}
                            <StoredEditButton
                              editing={
                                storedEditing &&
                                storedDraft?.storeId === previewStore.storeId
                              }
                              onToggle={toggleStoredEditing}
                            />
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
                        aria-label="Close all stored data"
                        onClick={() => {
                          setAllStoredOpen(false);
                          setAllStoredPreviewId(null);
                          setAllStoredPreviewCampaignKey(null);
                        }}
                      >
                        <X className="size-5" />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                      {previewStore ? (
                        <>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                              Store settings
                            </p>
                            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                              {editingPreview ? (
                                <StoreNameField
                                  value={nameFor(previewStore.storeId)}
                                  onChange={(value) =>
                                    changeStoreName(previewStore.storeId, value)
                                  }
                                />
                              ) : (
                                <div className="space-y-0.5">
                                  <p className="text-xs text-stone-500">Name</p>
                                  <p className="truncate text-sm text-stone-200">
                                    {nameFor(previewStore.storeId) ||
                                      previewStore.name ||
                                      "Not set"}
                                  </p>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-3">
                                {editingPreview ? (
                                  <>
                                    <label className="block min-w-0 space-y-1">
                                      <span className="text-xs text-stone-500">
                                        Dates
                                      </span>
                                      <Select
                                        value={previewDatesValue}
                                        items={STORE_DATES_LABELS}
                                        onValueChange={(value) => {
                                          if (
                                            value === "full" ||
                                            value === "short"
                                          ) {
                                            changeStoreDates(
                                              previewStore.storeId,
                                              value,
                                            );
                                          } else if (
                                            value === "days" &&
                                            debugDays
                                          ) {
                                            changeStoreDates(
                                              previewStore.storeId,
                                              value,
                                            );
                                          }
                                        }}
                                      >
                                        <SelectTrigger
                                          aria-label="Dates display"
                                          className="h-11 w-full min-w-0 rounded-xl border-white/10 bg-black/30 px-3 text-white hover:bg-black/40 focus-visible:border-white/20 focus-visible:ring-white/15 dark:bg-black/30 [&_svg]:text-stone-400"
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent
                                          align="start"
                                          alignItemWithTrigger={false}
                                          className="z-[120] rounded-xl border-white/10 bg-popover p-1"
                                        >
                                          {storeDatesModes.map((mode) => (
                                            <SelectItem key={mode} value={mode}>
                                              {STORE_DATES_LABELS[mode]}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </label>
                                    <label className="block min-w-0 space-y-1">
                                      <span className="text-xs text-stone-500">
                                        List
                                      </span>
                                      <Select
                                        value={previewListValue}
                                        items={STORE_LIST_LABELS}
                                        onValueChange={(value) => {
                                          if (
                                            value === "tags" ||
                                            value === "compact"
                                          ) {
                                            changeStoreList(
                                              previewStore.storeId,
                                              value,
                                            );
                                          }
                                        }}
                                      >
                                        <SelectTrigger
                                          aria-label="List display"
                                          className="h-11 w-full min-w-0 rounded-xl border-white/10 bg-black/30 px-3 text-white hover:bg-black/40 focus-visible:border-white/20 focus-visible:ring-white/15 dark:bg-black/30 [&_svg]:text-stone-400"
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent
                                          align="start"
                                          alignItemWithTrigger={false}
                                          className="z-[120] rounded-xl border-white/10 bg-popover p-1"
                                        >
                                          {(
                                            Object.keys(
                                              STORE_LIST_LABELS,
                                            ) as StoreListMode[]
                                          ).map((mode) => (
                                            <SelectItem key={mode} value={mode}>
                                              {STORE_LIST_LABELS[mode]}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </label>
                                  </>
                                ) : (
                                  <>
                                    <div className="space-y-0.5">
                                      <p className="text-xs text-stone-500">
                                        Dates
                                      </p>
                                      <p className="text-sm text-stone-200">
                                        {previewDatesLabel}
                                      </p>
                                    </div>
                                    <div className="space-y-0.5">
                                      <p className="text-xs text-stone-500">
                                        List
                                      </p>
                                      <p className="text-sm text-stone-200">
                                        {previewListLabel}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                              Campaign presets
                              {previewCampaigns.length > 0
                                ? ` · ${previewCampaigns.length}`
                                : ""}
                            </p>
                            {previewCampaigns.length === 0 ? (
                              <p className="text-sm text-stone-500">
                                No campaign presets saved for this store yet.
                              </p>
                            ) : selectedCampaign ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={allStoredPreviewCampaignKey ?? undefined}
                                    items={campaignSelectItems}
                                    onValueChange={(value) => {
                                      if (typeof value === "string" && value) {
                                        setAllStoredPreviewCampaignKey(value);
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      aria-label="Preview campaign"
                                      className="h-11 min-w-0 flex-1 rounded-xl border-white/10 bg-black/30 px-3 text-white hover:bg-black/40 focus-visible:border-white/20 focus-visible:ring-white/15 dark:bg-black/30 [&_svg]:text-stone-400"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent
                                      align="start"
                                      alignItemWithTrigger={false}
                                      className="z-[120] max-w-[min(24rem,calc(100vw-2.5rem))] rounded-xl border-white/10 bg-popover p-1"
                                    >
                                      {previewCampaigns.flatMap((item) => {
                                        const key = campaignKey(
                                          item.issued,
                                          item.validUntil,
                                        );
                                        if (!key) return [];
                                        return [
                                          <SelectItem key={key} value={key}>
                                            {item.title}
                                          </SelectItem>,
                                        ];
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <button
                                    type="button"
                                    aria-label="Clear campaign selection"
                                    onClick={() =>
                                      setAllStoredPreviewCampaignKey(null)
                                    }
                                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-stone-200 ring-1 ring-white/15"
                                  >
                                    <X className="size-3.5" aria-hidden />
                                    Clear
                                  </button>
                                </div>
                                <article className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="min-w-0 truncate text-sm font-medium text-white">
                                      {selectedCampaign.title}
                                    </p>
                                    {selectedCampaignOnScreen ? (
                                      <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-300">
                                        On screen
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 text-xs text-stone-400">
                                    Issued{" "}
                                    {formatShortDate(selectedCampaign.issued)} ·
                                    Valid until{" "}
                                    {formatShortDate(
                                      selectedCampaign.validUntil,
                                    )}
                                    {selectedCampaign.version
                                      ? ` · Version ${selectedCampaign.version}`
                                      : ""}
                                  </p>
                                  <StoredCampaignDetails
                                    item={selectedCampaign}
                                    editing={editingPreview}
                                    showStoreDisplay={false}
                                    invalidDefaults={
                                      selectedCampaignOnScreen
                                        ? invalidDefaults
                                        : []
                                    }
                                    onOpenHidden={(entry) =>
                                      openStoredProduct(
                                        entry.name,
                                        selectedCampaign.issued,
                                        selectedCampaign.validUntil,
                                      )
                                    }
                                    onRemoveHidden={(entry) =>
                                      removeHidden(
                                        previewStore.storeId,
                                        selectedCampaign.issued,
                                        selectedCampaign.validUntil,
                                        hiddenEntryKey(entry),
                                        selectedCampaignOnScreen,
                                      )
                                    }
                                    onRemoveDefault={(name) =>
                                      removeDefault(
                                        previewStore.storeId,
                                        selectedCampaign.issued,
                                        selectedCampaign.validUntil,
                                        name,
                                        selectedCampaignOnScreen,
                                      )
                                    }
                                    onChangeDefault={(name, section) =>
                                      changeDefault(
                                        previewStore.storeId,
                                        selectedCampaign.issued,
                                        selectedCampaign.validUntil,
                                        name,
                                        section,
                                        selectedCampaignOnScreen,
                                      )
                                    }
                                    onUpdateInvalidDefault={(name) => {
                                      const hit = invalidDefaults.find(
                                        (row) => row.name === name,
                                      );
                                      if (hit) updateInvalidDefault(hit);
                                    }}
                                    onRemoveAllHidden={() =>
                                      removeAllHidden(
                                        previewStore.storeId,
                                        selectedCampaign.issued,
                                        selectedCampaign.validUntil,
                                        selectedCampaignOnScreen,
                                      )
                                    }
                                    onRemoveAllDefaults={() =>
                                      removeAllDefaults(
                                        previewStore.storeId,
                                        selectedCampaign.issued,
                                        selectedCampaign.validUntil,
                                        selectedCampaignOnScreen,
                                      )
                                    }
                                  />
                                </article>
                              </>
                            ) : (
                              previewCampaigns.flatMap((item) => {
                                const key = campaignKey(
                                  item.issued,
                                  item.validUntil,
                                );
                                if (!key) return [];
                                return [
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() =>
                                      setAllStoredPreviewCampaignKey(key)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-left hover:bg-white/[0.06]"
                                  >
                                    <p className="min-w-0 truncate text-sm font-medium text-white">
                                      {item.title}
                                    </p>
                                    <p className="mt-0.5 text-xs text-stone-400">
                                      Issued {formatShortDate(item.issued)} ·
                                      Valid until{" "}
                                      {formatShortDate(item.validUntil)}
                                      {item.version
                                        ? ` · Version ${item.version}`
                                        : ""}
                                    </p>
                                    <p className="mt-1 text-[0.7rem] text-stone-500">
                                      Hidden {item.hidden.length}
                                      <span className="text-stone-600">
                                        {" "}
                                        ·{" "}
                                      </span>
                                      Defaults{" "}
                                      {
                                        Object.keys(item.preset.defaults)
                                          .length
                                      }
                                    </p>
                                  </button>,
                                ];
                              })
                            )}
                          </div>
                        </>
                      ) : deviceStoreSettings.length === 0 ? (
                        <p className="text-sm text-stone-500">
                          Nothing is saved on this device yet. Import a backup to
                          load stores and campaign presets.
                        </p>
                      ) : (
                        deviceStoreSettings.map((store) => {
                          const label = nameFor(store.storeId) || store.name;
                          const isCurrent = storeId === store.storeId;
                          const datesLabel = store.showDayCounts
                            ? "Days and hours"
                            : store.compactDates
                              ? "Short"
                              : "Full";
                          const listLabel = store.compactList
                            ? "Compact"
                            : "Normal";
                          return (
                            <div
                              key={store.storeId}
                              className={cn(
                                "flex w-full items-stretch gap-1 rounded-lg border px-1.5 py-1.5",
                                isCurrent
                                  ? "border-sky-400/40 bg-sky-500/10"
                                  : "border-white/10 bg-black/20",
                              )}
                            >
                              <button
                                type="button"
                                aria-label={
                                  isCurrent
                                    ? `Current store ${store.storeId}`
                                    : `Select store ${store.storeId} as current`
                                }
                                aria-pressed={isCurrent}
                                onClick={() =>
                                  commitStoreIdValue(store.storeId)
                                }
                                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/[0.06]"
                              >
                                <span
                                  className={cn(
                                    "size-3.5 rounded-full border-2",
                                    isCurrent
                                      ? "border-sky-300 bg-sky-300"
                                      : "border-stone-500 bg-transparent",
                                  )}
                                  aria-hidden
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAllStoredPreviewId(store.storeId);
                                  setAllStoredPreviewCampaignKey(
                                    autoPreviewCampaignKey(store.storeId),
                                  );
                                  setStoreDraft(store.storeId);
                                  setStoreMenuOpen(false);
                                  setStoreMenuAll(false);
                                }}
                                className="min-w-0 flex-1 rounded-lg px-1.5 py-1 text-left hover:bg-white/[0.06]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate text-sm font-medium text-white">
                                    {label || "Unnamed store"}
                                  </span>
                                  <span className="shrink-0 font-mono text-xs text-stone-300">
                                    {store.storeId}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-[0.7rem] text-stone-400">
                                  Dates {datesLabel}
                                  <span className="text-stone-600"> · </span>
                                  List {listLabel}
                                  <span className="text-stone-600"> · </span>
                                  {store.campaignCount === 0
                                    ? "No presets"
                                    : store.campaignCount === 1
                                      ? "1 preset"
                                      : `${store.campaignCount} presets`}
                                </p>
                              </button>
                              <button
                                type="button"
                                aria-label={`Store ${store.storeId} actions`}
                                onClick={() => {
                                  setStoreAction({
                                    storeId: store.storeId,
                                    step: "menu",
                                  });
                                  setStoreCopyChoices([]);
                                }}
                                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-stone-300 hover:bg-white/[0.06] hover:text-white"
                              >
                                <MoreHorizontal className="size-4" aria-hidden />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            {storeAction ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/45"
                  aria-label="Dismiss store actions"
                  onPointerDown={(event) => {
                    // Swallow the gesture so a synthetic click cannot hit the
                    // store list underneath and adopt another store's items.
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    dismissStoreAction();
                  }}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  className="relative z-10 flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-popover shadow-2xl ring-1 ring-foreground/10"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {(() => {
            if (!storeAction) return null;
            const sourceId = storeAction.storeId;
            const targetId = storeId;
            const sourceStore = deviceStoreSettings.find(
              (item) => item.storeId === sourceId,
            );
            const targetStore = targetId
              ? deviceStoreSettings.find((item) => item.storeId === targetId)
              : null;
            const sourceLabel =
              nameFor(sourceId) || sourceStore?.name || sourceId;
            const targetLabel = targetId
              ? nameFor(targetId) || targetStore?.name || targetId
              : "";
            const sourceDatesLabel = sourceStore
              ? sourceStore.showDayCounts
                ? "Days and hours"
                : sourceStore.compactDates
                  ? "Short"
                  : "Full"
              : "—";
            const sourceListLabel = sourceStore
              ? sourceStore.compactList
                ? "Compact"
                : "Normal"
              : "—";
            const targetDatesLabel = targetStore
              ? targetStore.showDayCounts
                ? "Days and hours"
                : targetStore.compactDates
                  ? "Short"
                  : "Full"
              : targetId
                ? storeDatesLabel
                : "—";
            const targetListLabel = targetStore
              ? targetStore.compactList
                ? "Compact"
                : "Normal"
              : targetId
                ? storeListLabel
                : "—";
            const deskCampaignKey =
              desk.imported && desk.pack.chart.issued && desk.pack.chart.validUntil
                ? campaignKey(
                    desk.pack.chart.issued,
                    desk.pack.chart.validUntil,
                  )
                : null;
            const copyCampaignKey =
              autoPreviewCampaignKey(sourceId) ||
              (targetId ? autoPreviewCampaignKey(targetId) : null) ||
              deskCampaignKey;
            const copyCampaign = copyCampaignKey
              ? deviceStored.find(
                  (item) =>
                    item.storeId === sourceId &&
                    campaignKey(item.issued, item.validUntil) ===
                      copyCampaignKey,
                )
              : null;
            const targetCampaign =
              copyCampaignKey && targetId
                ? deviceStored.find(
                    (item) =>
                      item.storeId === targetId &&
                      campaignKey(item.issued, item.validUntil) ===
                        copyCampaignKey,
                  )
                : null;
            const copyHidden = copyCampaign?.hidden ?? [];
            const copyDefaults = copyCampaign
              ? productDefaultRows(copyCampaign.preset)
              : [];
            const targetUsesLive =
              Boolean(targetId) &&
              targetId === storeId &&
              Boolean(copyCampaignKey) &&
              Boolean(deskCampaignKey) &&
              copyCampaignKey === deskCampaignKey;
            const targetHidden = targetUsesLive
              ? hiddenEntries
              : (targetCampaign?.hidden ?? []);
            const targetDefaults = targetUsesLive
              ? productDefaultRows(itemPreset)
              : targetCampaign
                ? productDefaultRows(targetCampaign.preset)
                : [];
            const targetHiddenKeys = new Set(
              targetHidden.map((entry) => hiddenEntryKey(entry)),
            );
            const sourceHiddenKeys = new Set(
              copyHidden.map((entry) => hiddenEntryKey(entry)),
            );
            const targetDefaultByName = new Map(
              targetDefaults.map((row) => [row.name, row]),
            );
            const sourceDefaultByName = new Map(
              copyDefaults.map((row) => [row.name, row]),
            );
            const hiddenRows = [
              ...copyHidden.map((entry) => {
                const key = hiddenEntryKey(entry);
                return {
                  id: `hidden:${key}` as string,
                  label: formatHiddenLabel(entry),
                  inSource: true,
                  inTarget: targetHiddenKeys.has(key),
                  change: (targetHiddenKeys.has(key)
                    ? "unchanged"
                    : "add") as StoreCopyChangeKind,
                };
              }),
              ...targetHidden
                .filter((entry) => !sourceHiddenKeys.has(hiddenEntryKey(entry)))
                .map((entry) => {
                  const key = hiddenEntryKey(entry);
                  return {
                    id: `hidden:${key}`,
                    label: formatHiddenLabel(entry),
                    inSource: false,
                    inTarget: true,
                    change: "removed" as StoreCopyChangeKind,
                  };
                }),
            ];
            const defaultNames = [
              ...new Set([
                ...copyDefaults.map((row) => row.name),
                ...targetDefaults.map((row) => row.name),
              ]),
            ].sort((a, b) => a.localeCompare(b));
            const defaultRows = defaultNames.map((name) => {
              const sourceRow = sourceDefaultByName.get(name);
              const targetRow = targetDefaultByName.get(name);
              const change: StoreCopyChangeKind = !sourceRow
                ? "removed"
                : !targetRow
                  ? "add"
                  : sourceRow.section === targetRow.section
                    ? "unchanged"
                    : "add";
              return {
                id: `default:${name}`,
                name,
                sourceStorage: sourceRow?.storage ?? "—",
                targetStorage: targetRow?.storage ?? "—",
                inSource: Boolean(sourceRow),
                change,
              };
            });
            const settingsIds = ["dates", "list"];
            const hiddenIds = hiddenRows.map((row) => row.id);
            const defaultIds = defaultRows.map((row) => row.id);
            const campaignIds = [...hiddenIds, ...defaultIds];
            const settingsSelected = settingsIds.filter((id) =>
              storeCopyChoices.includes(id),
            );
            const hiddenSelected = hiddenIds.filter((id) =>
              storeCopyChoices.includes(id),
            );
            const defaultSelected = defaultIds.filter((id) =>
              storeCopyChoices.includes(id),
            );
            const campaignSelected = campaignIds.filter((id) =>
              storeCopyChoices.includes(id),
            );
            const settingsRowClass =
              "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_1.5rem] items-center gap-1.5 text-sm text-stone-300";
            const itemRowClass =
              "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-1.5 text-sm text-stone-300";
            const settingsCompareHeader = (
              <div
                className={cn(
                  settingsRowClass,
                  "text-[0.65rem] font-semibold uppercase tracking-wider text-stone-500",
                )}
              >
                <span />
                <span className="text-right">Old</span>
                <span className="text-right">New</span>
                <span className="sr-only">Change</span>
              </div>
            );

            if (storeAction.step === "menu") {
              return (
                <>
                  <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
                    <DialogTitle className="font-display text-xl text-white">
                      Store {sourceId}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-stone-400">
                      {sourceLabel || "Unnamed store"}
                    </DialogDescription>
                    <button
                      type="button"
                      className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
                      aria-label="Close store actions"
                      onClick={dismissStoreAction}
                    >
                      <X className="size-5" />
                    </button>
                  </DialogHeader>
                  <div className="grid gap-2 border-t border-white/10 p-4">
                    <Button
                      type="button"
                      className="h-11 rounded-xl"
                      disabled={!targetId || targetId === sourceId}
                      onClick={() => {
                        setStoreCopyChoices([]);
                        setStoreAction({ storeId: sourceId, step: "copy" });
                      }}
                    >
                      Copy to current store
                      {targetId && targetId !== sourceId
                        ? ` (${targetId})`
                        : ""}
                    </Button>
                    {!targetId ? (
                      <p className="text-xs text-stone-500">
                        Select a current store with the dot control first.
                      </p>
                    ) : targetId === sourceId ? (
                      <p className="text-xs text-stone-500">
                        Choose a different current store to copy into.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl border-white/15 text-white"
                      onClick={dismissStoreAction}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              );
            }

            return (
              <>
                <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
                  <DialogTitle className="font-display text-xl text-white">
                    Copy store data
                  </DialogTitle>
                  <DialogDescription className="text-sm text-stone-400">
                    From {sourceId}
                    {sourceLabel ? ` · ${sourceLabel}` : ""} into {targetId}
                    {targetLabel && targetLabel !== targetId
                      ? ` · ${targetLabel}`
                      : ""}
                    . Store name is never copied.
                  </DialogDescription>
                  <button
                    type="button"
                    className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
                    aria-label="Close copy store data"
                    onClick={dismissStoreAction}
                  >
                    <X className="size-5" />
                  </button>
                </DialogHeader>
                <div className="space-y-3 border-t border-white/10 px-4 py-3">
                  <div className="space-y-1.5">
                    <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-200">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-white/20 bg-black/30"
                        checked={
                          settingsIds.length > 0 &&
                          settingsSelected.length === settingsIds.length
                        }
                        ref={(node) => {
                          if (!node) return;
                          node.indeterminate =
                            settingsSelected.length > 0 &&
                            settingsSelected.length < settingsIds.length;
                        }}
                        onChange={(event) =>
                          setStoreCopyGroup(settingsIds, event.target.checked)
                        }
                      />
                      Store settings
                    </label>
                    <div className="space-y-1 border-l border-white/10 pl-4">
                      {settingsCompareHeader}
                      {(
                        [
                          {
                            id: "dates",
                            label: "Dates",
                            current: targetDatesLabel,
                            next: sourceDatesLabel,
                          },
                          {
                            id: "list",
                            label: "List",
                            current: targetListLabel,
                            next: sourceListLabel,
                          },
                        ] as const
                      ).map((row) => {
                        const change: StoreCopyChangeKind =
                          row.current === row.next ? "unchanged" : "add";
                        const selected = storeCopyChoices.includes(row.id);
                        return (
                          <label key={row.id} className={settingsRowClass}>
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                checked={selected}
                                onChange={() => toggleStoreCopyChoice(row.id)}
                              />
                              <span className="truncate">{row.label}</span>
                            </span>
                            <span
                              className={cn(
                                "truncate text-right text-xs",
                                selected && change === "add"
                                  ? "text-stone-500 line-through"
                                  : "text-stone-400",
                              )}
                            >
                              {row.current}
                            </span>
                            <span
                              className={cn(
                                "truncate text-right text-xs",
                                selected ? "text-sky-300" : "text-stone-400",
                              )}
                            >
                              {row.next}
                            </span>
                            <StoreCopyChangeTag change={change} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-200">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-white/20 bg-black/30"
                        disabled={campaignIds.length === 0}
                        checked={
                          campaignIds.length > 0 &&
                          campaignSelected.length === campaignIds.length
                        }
                        ref={(node) => {
                          if (!node) return;
                          node.indeterminate =
                            campaignSelected.length > 0 &&
                            campaignSelected.length < campaignIds.length;
                        }}
                        onChange={(event) =>
                          setStoreCopyGroup(campaignIds, event.target.checked)
                        }
                      />
                      <span className="min-w-0 truncate">
                        Current campaign
                        {copyCampaign ? ` · ${copyCampaign.title}` : ""}
                      </span>
                    </label>
                    {hiddenRows.length === 0 && defaultRows.length === 0 ? (
                      <p className="border-l border-white/10 pl-4 text-xs text-stone-500">
                        No campaign preset to copy from this store.
                      </p>
                    ) : (
                      <div className="space-y-2 border-l border-white/10 pl-4">
                        {hiddenRows.length > 0 ? (
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-sm font-medium text-stone-200">
                              <input
                                type="checkbox"
                                className="size-4 rounded border-white/20 bg-black/30"
                                disabled={hiddenIds.length === 0}
                                checked={
                                  hiddenIds.length > 0 &&
                                  hiddenSelected.length === hiddenIds.length
                                }
                                ref={(node) => {
                                  if (!node) return;
                                  node.indeterminate =
                                    hiddenSelected.length > 0 &&
                                    hiddenSelected.length < hiddenIds.length;
                                }}
                                onChange={(event) =>
                                  setStoreCopyGroup(
                                    hiddenIds,
                                    event.target.checked,
                                  )
                                }
                              />
                              All hidden
                              <span className="text-xs font-normal text-stone-500">
                                · {hiddenIds.length}
                              </span>
                            </label>
                            <div className="space-y-1 border-l border-white/10 pl-4">
                              {hiddenRows.map((row) => {
                                const selected = storeCopyChoices.includes(
                                  row.id,
                                );
                                return (
                                  <label key={row.id} className={itemRowClass}>
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                        checked={selected}
                                        onChange={() =>
                                          toggleStoreCopyChoice(row.id)
                                        }
                                      />
                                      <span
                                        className={cn(
                                          "truncate",
                                          row.change === "removed" &&
                                            "text-red-300/90 line-through",
                                        )}
                                      >
                                        {row.label}
                                      </span>
                                    </span>
                                    <StoreCopyChangeTag change={row.change} />
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        {defaultRows.length > 0 ? (
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-sm font-medium text-stone-200">
                              <input
                                type="checkbox"
                                className="size-4 rounded border-white/20 bg-black/30"
                                disabled={defaultIds.length === 0}
                                checked={
                                  defaultIds.length > 0 &&
                                  defaultSelected.length === defaultIds.length
                                }
                                ref={(node) => {
                                  if (!node) return;
                                  node.indeterminate =
                                    defaultSelected.length > 0 &&
                                    defaultSelected.length < defaultIds.length;
                                }}
                                onChange={(event) =>
                                  setStoreCopyGroup(
                                    defaultIds,
                                    event.target.checked,
                                  )
                                }
                              />
                              All defaults
                              <span className="text-xs font-normal text-stone-500">
                                · {defaultIds.length}
                              </span>
                            </label>
                            <div className="space-y-1 border-l border-white/10 pl-4">
                              {defaultRows.map((row) => {
                                const selected = storeCopyChoices.includes(
                                  row.id,
                                );
                                return (
                                  <label key={row.id} className={itemRowClass}>
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                        checked={selected}
                                        onChange={() =>
                                          toggleStoreCopyChoice(row.id)
                                        }
                                      />
                                      <span
                                        className={cn(
                                          "truncate",
                                          row.change === "removed" &&
                                            "text-red-300/90 line-through",
                                        )}
                                      >
                                        {row.name}
                                      </span>
                                    </span>
                                    <StoreCopyChangeTag change={row.change} />
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 border-t border-white/10 p-4">
                  <Button
                    type="button"
                    className="h-11 rounded-xl"
                    disabled={storeCopyChoices.length === 0}
                    onClick={confirmStoreCopy}
                  >
                    Copy selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-white/15 text-white"
                    onClick={() => {
                      setStoreCopyChoices([]);
                      setStoreAction({ storeId: sourceId, step: "menu" });
                    }}
                  >
                    Back
                  </Button>
                </div>
              </>
            );
          })()}
                  </div>
                </div>
              </div>
            ) : null}
            {storedIo ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/45"
                  aria-label={
                    storedIo.mode === "export"
                      ? "Dismiss export stored data"
                      : "Dismiss import stored data"
                  }
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    dismissStoredIo();
                  }}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  className="relative z-10 flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-popover shadow-2xl ring-1 ring-foreground/10"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {(() => {
                    if (
                      storedIo.mode === "import" &&
                      storedIo.step === "review"
                    ) {
                      const reviewIds = storedIo.reviewIds;
                      const pageCount = reviewIds.length;
                      const pageIndex = Math.min(
                        Math.max(storedIo.reviewIndex, 0),
                        Math.max(pageCount - 1, 0),
                      );
                      const pageStoreId = reviewIds[pageIndex] ?? "";
                      const fileStore = storedIo.library.stores[pageStoreId];
                      const deviceStore = deviceStoreSettings.find(
                        (item) => item.storeId === pageStoreId,
                      );
                      const fileLabel =
                        fileStore?.settings.name || pageStoreId;
                      const deviceLabel =
                        nameFor(pageStoreId) ||
                        deviceStore?.name ||
                        pageStoreId;
                      const fileDatesLabel = fileStore
                        ? fileStore.settings.showDayCounts
                          ? "Days and hours"
                          : fileStore.settings.compactDates
                            ? "Short"
                            : "Full"
                        : "—";
                      const fileListLabel = fileStore
                        ? fileStore.settings.compactList
                          ? "Compact"
                          : "Normal"
                        : "—";
                      const deviceDatesLabel = deviceStore
                        ? deviceStore.showDayCounts
                          ? "Days and hours"
                          : deviceStore.compactDates
                            ? "Short"
                            : "Full"
                        : pageStoreId === storeId
                          ? storeDatesLabel
                          : "—";
                      const deviceListLabel = deviceStore
                        ? deviceStore.compactList
                          ? "Compact"
                          : "Normal"
                        : pageStoreId === storeId
                          ? storeListLabel
                          : "—";
                      const deskCampaignKey =
                        desk.imported &&
                        desk.pack.chart.issued &&
                        desk.pack.chart.validUntil
                          ? campaignKey(
                              desk.pack.chart.issued,
                              desk.pack.chart.validUntil,
                            )
                          : null;
                      const reviewCampaignKey = importReviewCampaignKey(
                        storedIo.library,
                        pageStoreId,
                      );
                      const fileCampaign =
                        reviewCampaignKey && fileStore
                          ? fileStore.campaigns[reviewCampaignKey]
                          : null;
                      const deviceCampaign =
                        reviewCampaignKey
                          ? deviceStored.find(
                              (item) =>
                                item.storeId === pageStoreId &&
                                campaignKey(item.issued, item.validUntil) ===
                                  reviewCampaignKey,
                            )
                          : null;
                      const fileHidden = fileCampaign?.hidden ?? [];
                      const fileDefaults = fileCampaign
                        ? productDefaultRows(fileCampaign.preset)
                        : [];
                      const targetUsesLive =
                        pageStoreId === storeId &&
                        Boolean(reviewCampaignKey) &&
                        Boolean(deskCampaignKey) &&
                        reviewCampaignKey === deskCampaignKey;
                      const deviceHidden = targetUsesLive
                        ? hiddenEntries
                        : (deviceCampaign?.hidden ?? []);
                      const deviceDefaults = targetUsesLive
                        ? productDefaultRows(itemPreset)
                        : deviceCampaign
                          ? productDefaultRows(deviceCampaign.preset)
                          : [];
                      const deviceHiddenKeys = new Set(
                        deviceHidden.map((entry) => hiddenEntryKey(entry)),
                      );
                      const fileHiddenKeys = new Set(
                        fileHidden.map((entry) => hiddenEntryKey(entry)),
                      );
                      const deviceDefaultByName = new Map(
                        deviceDefaults.map((row) => [row.name, row]),
                      );
                      const fileDefaultByName = new Map(
                        fileDefaults.map((row) => [row.name, row]),
                      );
                      const hiddenRows = [
                        ...fileHidden.map((entry) => {
                          const key = hiddenEntryKey(entry);
                          return {
                            id: `hidden:${key}`,
                            label: formatHiddenLabel(entry),
                            change: (deviceHiddenKeys.has(key)
                              ? "unchanged"
                              : "add") as StoreCopyChangeKind,
                          };
                        }),
                        ...deviceHidden
                          .filter(
                            (entry) =>
                              !fileHiddenKeys.has(hiddenEntryKey(entry)),
                          )
                          .map((entry) => {
                            const key = hiddenEntryKey(entry);
                            return {
                              id: `hidden:${key}`,
                              label: formatHiddenLabel(entry),
                              change: "removed" as StoreCopyChangeKind,
                            };
                          }),
                      ];
                      const defaultNames = [
                        ...new Set([
                          ...fileDefaults.map((row) => row.name),
                          ...deviceDefaults.map((row) => row.name),
                        ]),
                      ].sort((a, b) => a.localeCompare(b));
                      const defaultRows = defaultNames.map((name) => {
                        const fileRow = fileDefaultByName.get(name);
                        const deviceRow = deviceDefaultByName.get(name);
                        const change: StoreCopyChangeKind = !fileRow
                          ? "removed"
                          : !deviceRow
                            ? "add"
                            : fileRow.section === deviceRow.section
                              ? "unchanged"
                              : "add";
                        return {
                          id: `default:${name}`,
                          name,
                          change,
                        };
                      });
                      const settingsIds = ["dates", "list"];
                      const hiddenIds = hiddenRows.map((row) => row.id);
                      const defaultIds = defaultRows.map((row) => row.id);
                      const campaignIds = [...hiddenIds, ...defaultIds];
                      const pageChoices =
                        storedIoReviewChoices[pageStoreId] ?? [];
                      const settingsSelected = settingsIds.filter((id) =>
                        pageChoices.includes(id),
                      );
                      const hiddenSelected = hiddenIds.filter((id) =>
                        pageChoices.includes(id),
                      );
                      const defaultSelected = defaultIds.filter((id) =>
                        pageChoices.includes(id),
                      );
                      const campaignSelected = campaignIds.filter((id) =>
                        pageChoices.includes(id),
                      );
                      const anySelected = reviewIds.some(
                        (id) => (storedIoReviewChoices[id] ?? []).length > 0,
                      );
                      const setPageChoices = (
                        updater: (current: string[]) => string[],
                      ) => {
                        setStoredIoReviewChoices((current) => ({
                          ...current,
                          [pageStoreId]: updater(current[pageStoreId] ?? []),
                        }));
                      };
                      const togglePageChoice = (id: string) => {
                        setPageChoices((current) =>
                          current.includes(id)
                            ? current.filter((item) => item !== id)
                            : [...current, id],
                        );
                      };
                      const setPageGroup = (ids: string[], on: boolean) => {
                        setPageChoices((current) => {
                          const without = current.filter(
                            (item) => !ids.includes(item),
                          );
                          return on ? [...without, ...ids] : without;
                        });
                      };
                      const settingsRowClass =
                        "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_1.5rem] items-center gap-1.5 text-sm text-stone-300";
                      const itemRowClass =
                        "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-1.5 text-sm text-stone-300";
                      const goPage = (nextIndex: number) => {
                        setStoredIo({
                          ...storedIo,
                          reviewIndex: nextIndex,
                        });
                      };
                      return (
                        <>
                          <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
                            <DialogTitle className="font-display text-xl text-white">
                              Import store data
                            </DialogTitle>
                            <DialogDescription className="text-sm text-stone-400">
                              Store {pageIndex + 1} of {pageCount}
                              {pageStoreId
                                ? ` · ${pageStoreId}${
                                    fileLabel && fileLabel !== pageStoreId
                                      ? ` · ${fileLabel}`
                                      : deviceLabel &&
                                          deviceLabel !== pageStoreId
                                        ? ` · ${deviceLabel}`
                                        : ""
                                  }`
                                : ""}
                              . Choose what to bring from the file (New) onto
                              this device (Old).
                            </DialogDescription>
                            <button
                              type="button"
                              className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
                              aria-label="Close import review"
                              onClick={dismissStoredIo}
                            >
                              <X className="size-5" />
                            </button>
                          </DialogHeader>
                          <div className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto border-t border-white/10 px-4 py-3">
                            <div className="space-y-1.5">
                              <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-200">
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-white/20 bg-black/30"
                                  checked={
                                    settingsIds.length > 0 &&
                                    settingsSelected.length ===
                                      settingsIds.length
                                  }
                                  ref={(node) => {
                                    if (!node) return;
                                    node.indeterminate =
                                      settingsSelected.length > 0 &&
                                      settingsSelected.length <
                                        settingsIds.length;
                                  }}
                                  onChange={(event) =>
                                    setPageGroup(
                                      settingsIds,
                                      event.target.checked,
                                    )
                                  }
                                />
                                Store settings
                              </label>
                              <div className="space-y-1 border-l border-white/10 pl-4">
                                <div
                                  className={cn(
                                    settingsRowClass,
                                    "text-[0.65rem] font-semibold uppercase tracking-wider text-stone-500",
                                  )}
                                >
                                  <span />
                                  <span className="text-right">Old</span>
                                  <span className="text-right">New</span>
                                  <span className="sr-only">Change</span>
                                </div>
                                {(
                                  [
                                    {
                                      id: "dates",
                                      label: "Dates",
                                      current: deviceDatesLabel,
                                      next: fileDatesLabel,
                                    },
                                    {
                                      id: "list",
                                      label: "List",
                                      current: deviceListLabel,
                                      next: fileListLabel,
                                    },
                                  ] as const
                                ).map((row) => {
                                  const change: StoreCopyChangeKind =
                                    row.current === row.next
                                      ? "unchanged"
                                      : "add";
                                  const selected = pageChoices.includes(row.id);
                                  return (
                                    <label
                                      key={row.id}
                                      className={settingsRowClass}
                                    >
                                      <span className="inline-flex min-w-0 items-center gap-2">
                                        <input
                                          type="checkbox"
                                          className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                          checked={selected}
                                          onChange={() =>
                                            togglePageChoice(row.id)
                                          }
                                        />
                                        <span className="truncate">
                                          {row.label}
                                        </span>
                                      </span>
                                      <span
                                        className={cn(
                                          "truncate text-right text-xs",
                                          selected && change === "add"
                                            ? "text-stone-500 line-through"
                                            : "text-stone-400",
                                        )}
                                      >
                                        {row.current}
                                      </span>
                                      <span
                                        className={cn(
                                          "truncate text-right text-xs",
                                          selected
                                            ? "text-sky-300"
                                            : "text-stone-400",
                                        )}
                                      >
                                        {row.next}
                                      </span>
                                      <StoreCopyChangeTag change={change} />
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-200">
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-white/20 bg-black/30"
                                  disabled={campaignIds.length === 0}
                                  checked={
                                    campaignIds.length > 0 &&
                                    campaignSelected.length ===
                                      campaignIds.length
                                  }
                                  ref={(node) => {
                                    if (!node) return;
                                    node.indeterminate =
                                      campaignSelected.length > 0 &&
                                      campaignSelected.length <
                                        campaignIds.length;
                                  }}
                                  onChange={(event) =>
                                    setPageGroup(
                                      campaignIds,
                                      event.target.checked,
                                    )
                                  }
                                />
                                <span className="min-w-0 truncate">
                                  Current campaign
                                  {fileCampaign
                                    ? ` · ${fileCampaign.title}`
                                    : ""}
                                </span>
                              </label>
                              {hiddenRows.length === 0 &&
                              defaultRows.length === 0 ? (
                                <p className="border-l border-white/10 pl-4 text-xs text-stone-500">
                                  No campaign preset to import for this store.
                                </p>
                              ) : (
                                <div className="space-y-2 border-l border-white/10 pl-4">
                                  {hiddenRows.length > 0 ? (
                                    <div className="space-y-1">
                                      <label className="flex items-center gap-2 text-sm font-medium text-stone-200">
                                        <input
                                          type="checkbox"
                                          className="size-4 rounded border-white/20 bg-black/30"
                                          checked={
                                            hiddenIds.length > 0 &&
                                            hiddenSelected.length ===
                                              hiddenIds.length
                                          }
                                          ref={(node) => {
                                            if (!node) return;
                                            node.indeterminate =
                                              hiddenSelected.length > 0 &&
                                              hiddenSelected.length <
                                                hiddenIds.length;
                                          }}
                                          onChange={(event) =>
                                            setPageGroup(
                                              hiddenIds,
                                              event.target.checked,
                                            )
                                          }
                                        />
                                        All hidden
                                        <span className="text-xs font-normal text-stone-500">
                                          · {hiddenIds.length}
                                        </span>
                                      </label>
                                      <div className="space-y-1 border-l border-white/10 pl-4">
                                        {hiddenRows.map((row) => {
                                          const selected = pageChoices.includes(
                                            row.id,
                                          );
                                          return (
                                            <label
                                              key={row.id}
                                              className={itemRowClass}
                                            >
                                              <span className="inline-flex min-w-0 items-center gap-2">
                                                <input
                                                  type="checkbox"
                                                  className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                                  checked={selected}
                                                  onChange={() =>
                                                    togglePageChoice(row.id)
                                                  }
                                                />
                                                <span
                                                  className={cn(
                                                    "truncate",
                                                    row.change === "removed" &&
                                                      "text-red-300/90 line-through",
                                                  )}
                                                >
                                                  {row.label}
                                                </span>
                                              </span>
                                              <StoreCopyChangeTag
                                                change={row.change}
                                              />
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                  {defaultRows.length > 0 ? (
                                    <div className="space-y-1">
                                      <label className="flex items-center gap-2 text-sm font-medium text-stone-200">
                                        <input
                                          type="checkbox"
                                          className="size-4 rounded border-white/20 bg-black/30"
                                          checked={
                                            defaultIds.length > 0 &&
                                            defaultSelected.length ===
                                              defaultIds.length
                                          }
                                          ref={(node) => {
                                            if (!node) return;
                                            node.indeterminate =
                                              defaultSelected.length > 0 &&
                                              defaultSelected.length <
                                                defaultIds.length;
                                          }}
                                          onChange={(event) =>
                                            setPageGroup(
                                              defaultIds,
                                              event.target.checked,
                                            )
                                          }
                                        />
                                        All defaults
                                        <span className="text-xs font-normal text-stone-500">
                                          · {defaultIds.length}
                                        </span>
                                      </label>
                                      <div className="space-y-1 border-l border-white/10 pl-4">
                                        {defaultRows.map((row) => {
                                          const selected = pageChoices.includes(
                                            row.id,
                                          );
                                          return (
                                            <label
                                              key={row.id}
                                              className={itemRowClass}
                                            >
                                              <span className="inline-flex min-w-0 items-center gap-2">
                                                <input
                                                  type="checkbox"
                                                  className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                                  checked={selected}
                                                  onChange={() =>
                                                    togglePageChoice(row.id)
                                                  }
                                                />
                                                <span
                                                  className={cn(
                                                    "truncate",
                                                    row.change === "removed" &&
                                                      "text-red-300/90 line-through",
                                                  )}
                                                >
                                                  {row.name}
                                                </span>
                                              </span>
                                              <StoreCopyChangeTag
                                                change={row.change}
                                              />
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 border-t border-white/10 p-4">
                            {pageCount > 1 ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-11 flex-1 rounded-xl border-white/15 text-white"
                                  disabled={pageIndex <= 0}
                                  onClick={() => goPage(pageIndex - 1)}
                                >
                                  <ChevronLeft className="size-4" aria-hidden />
                                  Previous
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-11 flex-1 rounded-xl border-white/15 text-white"
                                  disabled={pageIndex >= pageCount - 1}
                                  onClick={() => goPage(pageIndex + 1)}
                                >
                                  Next
                                  <ChevronRight
                                    className="size-4"
                                    aria-hidden
                                  />
                                </Button>
                              </div>
                            ) : null}
                            <Button
                              type="button"
                              className="h-11 rounded-xl"
                              disabled={!anySelected}
                              onClick={confirmImportReview}
                            >
                              Import selected
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 rounded-xl border-white/15 text-white"
                              onClick={() =>
                                setStoredIo({
                                  ...storedIo,
                                  step: "pick",
                                  reviewIndex: 0,
                                })
                              }
                            >
                              Back
                            </Button>
                          </div>
                        </>
                      );
                    }

                    const exportMode = storedIo.mode === "export";
                    const importSummary =
                      storedIo.mode === "import" ? storedIo.summary : null;
                    const importLibrary =
                      storedIo.mode === "import" ? storedIo.library : null;
                    const storeRows = exportMode
                      ? deviceStoreSettings.map((store) => ({
                          storeId: store.storeId,
                          name: nameFor(store.storeId) || store.name,
                          detail:
                            store.campaignCount === 0
                              ? "No presets"
                              : store.campaignCount === 1
                                ? "1 preset"
                                : `${store.campaignCount} presets`,
                        }))
                      : Object.keys(importLibrary?.stores ?? {})
                          .sort((a, b) =>
                            a.localeCompare(b, undefined, { numeric: true }),
                          )
                          .map((id) => {
                            const store = importLibrary!.stores[id]!;
                            const count = Object.keys(store.campaigns).length;
                            return {
                              storeId: id,
                              name: store.settings.name,
                              detail:
                                count === 0
                                  ? "No presets"
                                  : count === 1
                                    ? "1 preset"
                                    : `${count} presets`,
                            };
                          });
                    const allIds = storeRows.map((row) => row.storeId);
                    const selectedCount = allIds.filter((id) =>
                      storedIoChoices.includes(id),
                    ).length;
                    const allSelected =
                      allIds.length > 0 && selectedCount === allIds.length;
                    return (
                      <>
                        <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
                          <DialogTitle className="font-display text-xl text-white">
                            {exportMode
                              ? "Export stored data"
                              : "Import stored data"}
                          </DialogTitle>
                          <DialogDescription className="text-sm text-stone-400">
                            {exportMode || !importSummary
                              ? "Choose all stores or individual ones to include in the backup file."
                              : `Choose all stores or individual ones, then review each like Copy. File has ${importSummary.stores} store${importSummary.stores === 1 ? "" : "s"}, ${importSummary.campaigns} campaign preset${importSummary.campaigns === 1 ? "" : "s"}, and ${importSummary.charts} chart${importSummary.charts === 1 ? "" : "s"}.`}
                          </DialogDescription>
                          <button
                            type="button"
                            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
                            aria-label={
                              exportMode
                                ? "Close export stored data"
                                : "Close import stored data"
                            }
                            onClick={dismissStoredIo}
                          >
                            <X className="size-5" />
                          </button>
                        </DialogHeader>
                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-white/10 px-4 py-3">
                          <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-200">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-white/20 bg-black/30"
                              disabled={allIds.length === 0}
                              checked={allSelected}
                              ref={(node) => {
                                if (!node) return;
                                node.indeterminate =
                                  selectedCount > 0 &&
                                  selectedCount < allIds.length;
                              }}
                              onChange={(event) =>
                                setStoredIoChoices(
                                  event.target.checked ? [...allIds] : [],
                                )
                              }
                            />
                            All stores
                            <span className="text-xs font-normal text-stone-500">
                              · {allIds.length}
                            </span>
                          </label>
                          <div className="space-y-1 border-l border-white/10 pl-4">
                            {storeRows.length === 0 ? (
                              <p className="text-xs text-stone-500">
                                {exportMode
                                  ? "No stores saved on this device."
                                  : "No stores in this file."}
                              </p>
                            ) : (
                              storeRows.map((row) => {
                                const selected = storedIoChoices.includes(
                                  row.storeId,
                                );
                                return (
                                  <label
                                    key={row.storeId}
                                    className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm text-stone-300"
                                  >
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        className="size-4 shrink-0 rounded border-white/20 bg-black/30"
                                        checked={selected}
                                        onChange={() =>
                                          setStoredIoChoices((current) =>
                                            current.includes(row.storeId)
                                              ? current.filter(
                                                  (id) => id !== row.storeId,
                                                )
                                              : [...current, row.storeId],
                                          )
                                        }
                                      />
                                      <span className="min-w-0 truncate">
                                        {row.name || "Unnamed store"}
                                      </span>
                                    </span>
                                    <span className="shrink-0 font-mono text-xs text-stone-400">
                                      {row.storeId}
                                      <span className="text-stone-600"> · </span>
                                      {row.detail}
                                    </span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                        <div className="grid gap-2 border-t border-white/10 p-4">
                          <Button
                            type="button"
                            className="h-11 rounded-xl"
                            disabled={storedIoChoices.length === 0}
                            onClick={() =>
                              exportMode
                                ? exportStoredData(storedIoChoices)
                                : beginImportReview(storedIoChoices)
                            }
                          >
                            {exportMode
                              ? storedIoChoices.length === 1
                                ? "Export selected store"
                                : "Export selected stores"
                              : storedIoChoices.length === 1
                                ? "Review store"
                                : "Review selected stores"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-xl border-white/15 text-white"
                            onClick={dismissStoredIo}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
      <Dialog
        open={storedConfirmOpen}
        onOpenChange={(next) => {
          if (!next) setStoredConfirmOpen(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[60] bg-black/50"
          className="z-[60] max-h-[min(40rem,calc(100dvh-2rem))] max-w-sm gap-0 overflow-y-auto rounded-2xl p-0"
        >
          <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
            <DialogTitle className="font-display text-xl text-white">
              Apply stored changes?
            </DialogTitle>
            <DialogDescription className="text-sm text-stone-400">
              {storedEditChanges.length === 1
                ? "1 change is ready to save for this store."
                : `${storedEditChanges.length} changes are ready to save for this store.`}
            </DialogDescription>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Close stored changes"
              onClick={() => setStoredConfirmOpen(false)}
            >
              <X className="size-5" />
            </button>
          </DialogHeader>
          <div className="space-y-3 border-t border-white/10 p-4">
            <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {storedEditChanges.map((change, index) => {
                const showGroup =
                  index === 0 || storedEditChanges[index - 1]?.group !== change.group;
                return (
                  <li key={change.id}>
                    {showGroup ? (
                      <p className="px-1 pt-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
                        {change.group}
                      </p>
                    ) : null}
                    <div className="rounded-lg px-1 py-1.5">
                      <p className="truncate text-sm text-white">{change.label}</p>
                      <p className="text-xs text-stone-400">
                        {change.from} → {change.to}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="grid gap-2">
              <Button
                type="button"
                className="h-11 rounded-xl"
                onClick={commitStoredEdit}
              >
                Confirm
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-white/15 text-white"
                onClick={() => setStoredConfirmOpen(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-white/15 text-red-300"
                onClick={discardStoredEdit}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={storePrompt != null}
        onOpenChange={(next) => {
          if (!next) cancelStorePrompt();
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[60] bg-black/50"
          className="z-[60] max-h-[min(40rem,calc(100dvh-2rem))] max-w-sm gap-0 overflow-y-auto rounded-2xl p-0"
        >
          <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
            <DialogTitle className="font-display text-xl text-white">Keep settings?</DialogTitle>
            <DialogDescription className="text-sm text-stone-400">
              {storePrompt?.hasSaved
                ? `Store ${storePrompt.next} already has settings for this chart. Keep what is on screen, load the saved copy, or choose which changes to accept.`
                : `Store ${storePrompt?.next ?? ""} has nothing saved for this chart. Keep what is on screen, start fresh, or choose which changes to accept.`}
            </DialogDescription>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Close keep settings"
              onClick={cancelStorePrompt}
            >
              <X className="size-5" />
            </button>
          </DialogHeader>
          <div className="grid gap-2 border-t border-white/10 p-4">
            <Button type="button" className="h-11 rounded-xl" onClick={() => confirmStorePrompt(true)}>
              Keep settings
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 text-white"
              onClick={() => confirmStorePrompt(false)}
            >
              {storePrompt?.hasSaved ? "Use saved" : "Start fresh"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 text-white"
              aria-expanded={changesOpen}
              onClick={() => setChangesOpen((open) => !open)}
            >
              {changesOpen ? "Hide changes" : "Show changes"}
            </Button>
            {changesOpen ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                {storeChanges.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-stone-400">
                    This chart already matches.
                  </p>
                ) : (
                  <>
                    <div className="flex justify-end px-1 pb-1">
                      <button
                        type="button"
                        className="text-xs font-medium text-stone-300 underline-offset-2 hover:underline"
                        onClick={() =>
                          setChangeChoices(
                            allChangesSelected
                              ? []
                              : storeChanges.map((change) => change.id),
                          )
                        }
                      >
                        {allChangesSelected ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <ul className="max-h-52 space-y-2 overflow-y-auto">
                      {storeChanges.map((change, index) => {
                        const showGroup =
                          index === 0 || storeChanges[index - 1]?.group !== change.group;
                        const checked = changeChoices.includes(change.id);
                        return (
                          <li key={change.id}>
                            {showGroup ? (
                              <p className="px-1 pt-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
                                {change.group}
                              </p>
                            ) : null}
                            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-white/5">
                              <input
                                type="checkbox"
                                className="mt-1 size-4 accent-white"
                                checked={checked}
                                onChange={() =>
                                  setChangeChoices((current) =>
                                    current.includes(change.id)
                                      ? current.filter((id) => id !== change.id)
                                      : [...current, change.id],
                                  )
                                }
                              />
                              <span className="min-w-0">
                                <span className="block text-sm text-white">{change.label}</span>
                                <span className="block text-xs text-stone-400">
                                  {change.from} → {change.to}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <Button
                      type="button"
                      className="mt-2 h-11 w-full rounded-xl"
                      disabled={changeChoices.length === 0}
                      onClick={acceptSelectedChanges}
                    >
                      Accept selected
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 text-white"
              onClick={cancelStorePrompt}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>

    <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[60] bg-black/50"
        className="z-[60] max-w-sm gap-0 overflow-hidden rounded-2xl p-0"
      >
        <DialogHeader className="space-y-2 px-4 pt-4 pb-2">
          <DialogTitle className="font-display text-xl text-white">
            Clear the loaded chart?
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-400">
            All product data will be removed from this device. The list stays
            empty until you upload a chart again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-white/15 text-white"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400"
            onClick={resetChart}
          >
            <RotateCcw className="size-4" />
            Clear chart
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {pendingUpdate ? (
      <UpdateConfirmDialog
        open={updateConfirmOpen}
        onOpenChange={(next) => {
          setUpdateConfirmOpen(next);
          if (!next) setPendingUpdate(null);
        }}
        localVersion={pendingUpdate.localVersion}
        remoteVersion={pendingUpdate.remoteVersion}
        notes={pendingUpdate.notes}
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          void reloadAppToLatest().finally(() => {
            setBusy(false);
            setUpdateConfirmOpen(false);
            setPendingUpdate(null);
            setOpen(false);
          });
        }}
      />
    ) : null}

    <Dialog open={changelogOpen} onOpenChange={setChangelogOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[60] bg-black/50"
        className="z-[60] flex h-[min(28rem,85dvh)] w-[calc(100%-1.25rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-white/10 px-4 py-3 pr-14">
          <DialogTitle className="font-display text-xl text-white">
            Changelog
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-400">
            Recent app releases on this install.
          </DialogDescription>
          <button
            type="button"
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Close changelog"
            onClick={() => setChangelogOpen(false)}
          >
            <X className="size-5" />
          </button>
        </DialogHeader>
        <div className="min-h-0 flex-1 px-4 py-3">
          <ChangelogBrowser entries={CHANGELOG} className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function StoreNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-stone-500">Store name</span>
      <Input
        value={value}
        maxLength={48}
        placeholder="Name for this store"
        aria-label="Store name"
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border-white/10 bg-black/30 text-base text-white placeholder:text-stone-500"
      />
    </label>
  );
}

function StoredEditButton({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={editing}
      onClick={onToggle}
      className={cn(
        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold",
        editing ? "bg-red-500/15 text-red-300" : "text-stone-200 ring-1 ring-white/15",
      )}
    >
      {editing ? "Done" : "Edit"}
    </button>
  );
}

type StoreCopyChangeKind = "add" | "removed" | "unchanged";

function StoreCopyChangeTag({ change }: { change: StoreCopyChangeKind }) {
  const Icon = change === "add" ? Plus : change === "removed" ? Minus : Equal;
  const label =
    change === "add" ? "Add" : change === "removed" ? "Removed" : "Unchanged";
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center justify-self-end rounded-md",
        change === "add" && "bg-emerald-500/20 text-emerald-400",
        change === "removed" && "bg-red-500/20 text-red-400",
        change === "unchanged" && "bg-stone-500/15 text-stone-500",
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="size-3.5" aria-hidden strokeWidth={2.5} />
    </span>
  );
}

function RemoveMark({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-6 shrink-0 items-center justify-center text-red-500"
    >
      <X className="size-4" strokeWidth={2.5} />
    </button>
  );
}

function storedRowClass(index: number) {
  return cn(
    "flex min-h-8 items-center justify-between gap-2 rounded-md px-2",
    index % 2 === 0 ? "bg-white/[0.035]" : "bg-white/[0.09]",
  );
}

function InvalidDefaultsWarning({
  items,
  onUpdate,
  onRemove,
  onUpdateAll,
  onRemoveAll,
}: {
  items: InvalidProductDefault[];
  onUpdate: (item: InvalidProductDefault) => void;
  onRemove: (item: InvalidProductDefault) => void;
  onUpdateAll: () => void;
  onRemoveAll: () => void;
}) {
  const canUpdateAny = items.some((item) => item.update);
  return (
    <div
      role="status"
      className="space-y-2 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-100">
            {items.length === 1
              ? "1 saved default does not match this chart"
              : `${items.length} saved defaults do not match this chart`}
          </p>
          <p className="mt-0.5 text-xs text-amber-100/75">
            Update to the current product name, or remove the saved default.
          </p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-100">{item.name}</p>
              <p className="text-xs text-amber-100/70">{item.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {item.update ? (
                <button
                  type="button"
                  onClick={() => onUpdate(item)}
                  className="rounded-lg bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-100"
                >
                  Update
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-400/30"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-0.5">
        {canUpdateAny ? (
          <button
            type="button"
            onClick={onUpdateAll}
            className="rounded-lg bg-amber-400/20 px-2.5 py-1.5 text-xs font-semibold text-amber-100"
          >
            Update all
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemoveAll}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-400/30"
        >
          Remove all
        </button>
      </div>
    </div>
  );
}

const STORED_SECTION_ACTIVE: Record<SectionId, string> = {
  frozen: "bg-sky-400 text-sky-950 ring-sky-300",
  chilled: "bg-teal-400 text-teal-950 ring-teal-300",
  ready: "bg-amber-400 text-amber-950 ring-amber-300",
  ambient: "bg-orange-400 text-orange-950 ring-orange-300",
  pack: "bg-stone-300 text-stone-950 ring-stone-200",
};

function sectionsForStoredDefault(name: string, rules: ShelfRule[]): SectionId[] {
  const trimmed = canonicalProductName(name) || name.trim();
  if (!trimmed) return [];
  const found = new Set<SectionId>();
  for (const rule of rules) {
    if (rule.name.trim() === trimmed) found.add(rule.sectionId);
  }
  return SECTION_ORDER.filter((id) => found.has(id));
}

function StoredCampaignDetails({
  item,
  editing,
  showStoreDisplay = true,
  invalidDefaults = [],
  onOpenHidden,
  onRemoveHidden,
  onRemoveDefault,
  onChangeDefault,
  onUpdateInvalidDefault,
  onRemoveAllHidden,
  onRemoveAllDefaults,
}: {
  item: {
    hidden: HiddenEntry[];
    preset: ItemPreset;
    compactDates?: boolean;
    showDayCounts?: boolean;
    compactList?: boolean;
    rules?: ShelfRule[];
  };
  editing: boolean;
  /** When false, Dates/List are shown at store level instead. */
  showStoreDisplay?: boolean;
  invalidDefaults?: InvalidProductDefault[];
  onOpenHidden: (entry: HiddenEntry) => void;
  onRemoveHidden: (entry: HiddenEntry) => void;
  onRemoveDefault: (name: string) => void;
  onChangeDefault?: (name: string, section: SectionId) => void;
  onUpdateInvalidDefault?: (name: string) => void;
  onRemoveAllHidden: () => void;
  onRemoveAllDefaults: () => void;
}) {
  const defaults = productDefaultRows(item.preset);
  const invalidByName = new Map(invalidDefaults.map((row) => [row.name, row]));
  const rules = item.rules ?? [];
  const dateLabel = item.showDayCounts ? "Days and hours" : item.compactDates ? "Short" : "Full";
  return (
    <>
      {showStoreDisplay ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-stone-500">Dates</p>
          </div>
          <p className="px-2 text-sm text-stone-200">{dateLabel}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-stone-500">List</p>
          </div>
          <p className="px-2 text-sm text-stone-200">
            {item.compactList ? "Compact" : "Normal"}
          </p>
        </>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Hidden</p>
        {editing && item.hidden.length > 0 ? (
          <button
            type="button"
            aria-label="Remove all hidden"
            onClick={onRemoveAllHidden}
            className="text-xs font-semibold text-red-400"
          >
            Remove all
          </button>
        ) : null}
      </div>
      {item.hidden.length === 0 ? (
        <p className="px-2 text-sm text-stone-200">None</p>
      ) : (
        <ul className="text-sm text-stone-200">
          {item.hidden.map((entry, index) => (
            <li key={hiddenEntryKey(entry)} className={storedRowClass(index)}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onOpenHidden(entry)}
              >
                {formatHiddenLabel(entry)}
              </button>
              {editing ? (
                <RemoveMark
                  label={`Remove ${formatHiddenLabel(entry)}`}
                  onClick={() => onRemoveHidden(entry)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Defaults</p>
        {editing && defaults.length > 0 ? (
          <button
            type="button"
            aria-label="Remove all defaults"
            onClick={onRemoveAllDefaults}
            className="text-xs font-semibold text-red-400"
          >
            Remove all
          </button>
        ) : null}
      </div>
      {defaults.length === 0 ? (
        <p className="px-2 text-sm text-stone-200">None</p>
      ) : (
        <ul className="text-sm text-stone-200">
          {defaults.map((entry, index) => {
            const invalid = invalidByName.get(entry.name);
            const options = sectionsForStoredDefault(entry.name, rules);
            const canPick =
              editing && !invalid && options.length > 1 && onChangeDefault != null;
            return (
              <li
                key={entry.name}
                className={cn(
                  storedRowClass(index),
                  invalid && "ring-1 ring-inset ring-amber-400/35",
                )}
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate font-medium",
                      invalid && "text-amber-100",
                    )}
                  >
                    {entry.name}
                  </span>
                  {invalid ? (
                    <span className="mt-0.5 block truncate text-[0.7rem] text-amber-100/70">
                      {invalid.detail}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canPick ? (
                    <div
                      role="group"
                      aria-label={`${entry.name} storage default`}
                      className="flex items-center gap-1"
                    >
                      {options.map((section) => {
                        const selected = entry.section === section;
                        return (
                          <button
                            key={section}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChangeDefault(entry.name, section)}
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ring-1",
                              selected
                                ? STORED_SECTION_ACTIVE[section]
                                : "bg-transparent text-stone-400 ring-white/15",
                            )}
                          >
                            {SECTION_TAG[section]}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        invalid ? "text-amber-100/80" : "text-stone-400",
                      )}
                    >
                      {entry.storage}
                    </span>
                  )}
                  {invalid && invalid.update && onUpdateInvalidDefault ? (
                    <button
                      type="button"
                      onClick={() => onUpdateInvalidDefault(entry.name)}
                      className="rounded-md px-2 py-0.5 text-[0.65rem] font-semibold text-amber-100 ring-1 ring-amber-400/35"
                    >
                      Update
                    </button>
                  ) : null}
                  {invalid || editing ? (
                    <RemoveMark
                      label={`Remove ${entry.name} default`}
                      onClick={() => onRemoveDefault(entry.name)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function productDefaultRows(
  preset: ItemPreset,
): { name: string; section: SectionId; storage: string }[] {
  return Object.entries(preset.defaults)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, item]) => {
      if (!item.section) return null;
      return {
        name,
        section: item.section,
        storage: SECTION_TAG[item.section],
      };
    })
    .filter(
      (row): row is { name: string; section: SectionId; storage: string } => row != null,
    );
}

function SettingsSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
      {children}
    </h3>
  );
}

function TextConvertTable({ desk }: { desk: DeskState }) {
  const now = new Date();
  const rows = textConversionTable(desk.pack, desk.deliveryDate, desk.prepTime, now);
  const start = desk.deliveryDate ? formatLongDate(desk.deliveryDate) : "not set";
  const clock = prepClockTime(desk.prepTime, now);

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500">
        Use-bys are from the Delivery/Prep Date ({start}). Pack dates stay the printed date.
        Dough uses that date as the tray date. Hour clocks start at {clock}
        {desk.prepTime ? "" : " (live clock)"}. A life that differs from the chart is marked.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-400">Import a chart to see conversions.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-xl ring-1 ring-white/10">
          <table className="w-full min-w-[36rem] border-collapse text-left text-xs text-stone-200">
            <thead className="sticky top-0 z-10 bg-zinc-950 text-stone-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Product</th>
                <th className="px-2 py-2 font-semibold">Section</th>
                <th className="px-2 py-2 font-semibold">Field</th>
                <th className="px-2 py-2 font-semibold">Text</th>
                <th className="px-2 py-2 font-semibold">Use by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.section}:${row.name}:${row.field}:${row.text}`}
                  className="border-t border-white/10"
                >
                  <td className="px-2 py-1.5 align-top text-white">{row.name}</td>
                  <td className="px-2 py-1.5 align-top">{row.section}</td>
                  <td className="px-2 py-1.5 align-top">{row.field}</td>
                  <td
                    className={cn(
                      "px-2 py-1.5 align-top",
                      row.text.includes(" · chart ") && "text-amber-300",
                    )}
                  >
                    {row.text}
                  </td>
                  <td className="px-2 py-1.5 align-top whitespace-nowrap">{row.useBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
