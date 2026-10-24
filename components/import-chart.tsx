"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  Settings,
  Unlock,
  X,
} from "lucide-react";
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
import { parseChartPack } from "@/lib/chart-pack";
import { formatLongDate } from "@/lib/dates";
import {
  clearImportedPack,
  setImportedPack,
  type DeskState,
} from "@/lib/desk-store";
import { parsePdfChartFile } from "@/lib/pdf-chart";
import { prepClockTime } from "@/lib/preview";
import { reloadAppToLatest } from "@/lib/reload-app";
import { textConversionTable } from "@/lib/text-conversion";
import { fetchRemoteChart } from "@/lib/remote-chart";
import {
  DEFAULT_ROTATION_PREF,
  getRotationPref,
  hydrateRotationStore,
  setPreferredOrientation,
  setRotationLocked,
  subscribeRotation,
} from "@/lib/rotation-store";
import { cn } from "cn";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

const DEBUG_KEY = "shelf-life-debug";
const debugListeners = new Set<() => void>();

function subscribeDebug(listener: () => void) {
  debugListeners.add(listener);
  return () => debugListeners.delete(listener);
}

function readDebug() {
  try {
    return window.localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDebug(on: boolean) {
  try {
    window.localStorage.setItem(DEBUG_KEY, on ? "1" : "0");
  } catch {
    // Ignore quota / private mode.
  }
  for (const listener of debugListeners) listener();
}

export function ImportChartButton({
  desk,
  open: openProp,
  onOpenChange,
}: {
  desk: DeskState;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [url, setUrl] = useState(desk.sourceUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const debug = useSyncExternalStore(subscribeDebug, readDebug, () => false);
  const rotation = useSyncExternalStore(
    subscribeRotation,
    () => {
      hydrateRotationStore();
      return getRotationPref();
    },
    () => DEFAULT_ROTATION_PREF,
  );

  useEffect(() => () => stopScan(), []);

  function handleOpenChange(next: boolean) {
    if (next) {
      setUrl(desk.sourceUrl);
      setMessage(null);
      setError(null);
    } else {
      stopScan();
    }
    setOpen(next);
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

  async function applyPack(pack: Awaited<ReturnType<typeof parseChartPack>>, source: string) {
    if (!pack.ok) {
      setError(pack.error);
      return;
    }
    setImportedPack(pack.pack, source);
    setMessage(`Loaded ${pack.pack.rules.length} products.`);
    setError(null);
    stopScan();
  }

  async function importFromUrl(nextUrl: string) {
    setBusy(true);
    setMessage(null);
    setError(null);
    const result = await fetchRemoteChart(nextUrl);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setImportedPack(result.pack, nextUrl.trim());
    setUrl(nextUrl.trim());
    setMessage(`Loaded ${result.pack.rules.length} products from Google Drive.`);
    stopScan();
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
      setError("That file is not valid chart JSON.");
    }
  }

  async function readQrFromImage(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!window.BarcodeDetector) {
        setError("This phone browser cannot read QR codes from photos. Try a file or URL.");
        return;
      }
      const bitmap = await createImageBitmap(file);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const value = codes[0]?.rawValue?.trim();
      if (!value) {
        setError("No QR code found in that picture.");
        return;
      }
      if (/^https?:\/\//i.test(value)) {
        setUrl(value);
        await importFromUrl(value);
      } else {
        await importFromText(value, "photo-qr");
      }
    } catch {
      setError("Could not read that picture.");
    } finally {
      setBusy(false);
    }
  }

  async function startScan() {
    setError(null);
    if (!window.BarcodeDetector) {
      setError("Live QR scanning is not supported here. Use a photo, file, or URL.");
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
      setError("Camera permission was blocked.");
      stopScan();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25"
            aria-label="Settings"
          />
        }
      >
        <Settings className="size-5" />
      </DialogTrigger>
      <DialogContent
        className="relative max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-md gap-0 overflow-y-auto rounded-2xl p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-white/10 px-4 py-4 pr-14">
          <DialogTitle className="font-display text-2xl text-white">Settings</DialogTitle>
          <DialogDescription className="text-stone-400">
            Upload a chart, check for updates, or change display options.
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

        <div className="space-y-3 px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Upload chart
          </p>

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
              setError(null);
              setMessage(null);
              try {
                await applyPack(await parsePdfChartFile(file), file.name);
              } catch {
                setError("Could not read that PDF.");
              } finally {
                setBusy(false);
              }
            }}
          />

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
            disabled={busy}
            onClick={() => photoRef.current?.click()}
          >
            <ImageUp className="size-4" />
            Camera / picture
          </Button>

          {!scanning ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              disabled={busy}
              onClick={startScan}
            >
              <QrCode className="size-4" />
              Scan Drive QR
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-2xl bg-black">
                <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl border-white/10 text-white"
                onClick={stopScan}
              >
                <Camera className="size-4" />
                Stop camera
              </Button>
            </div>
          )}

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
              Share the PDF as “Anyone with the link”, then paste that link or put it in a QR code.
            </p>
          </div>

          {desk.imported ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full rounded-xl text-stone-300"
              onClick={() => {
                clearImportedPack();
                setUrl("");
                setMessage("Chart cleared.");
                setError(null);
              }}
            >
              <RotateCcw className="size-4" />
              Clear chart
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Display
            </p>
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
          </div>

          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Debug
            </p>
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
          </div>

          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              App
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage("Checking for updates…");
                setError(null);
                void reloadAppToLatest().finally(() => {
                  setBusy(false);
                  setMessage(null);
                  setOpen(false);
                });
              }}
            >
              <RefreshCw className="size-4" />
              Update app
            </Button>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? (
            <p className="rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200">
              {message}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
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
