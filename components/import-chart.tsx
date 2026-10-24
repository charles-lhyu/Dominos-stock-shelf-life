"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  FileText,
  ImageUp,
  Link2,
  QrCode,
  RefreshCw,
  RotateCcw,
  Upload,
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
import {
  clearImportedPack,
  setImportedPack,
  type DeskState,
} from "@/lib/desk-store";
import { parsePdfChartFile } from "@/lib/pdf-chart";
import { reloadAppToLatest } from "@/lib/reload-app";
import { fetchRemoteChart } from "@/lib/remote-chart";

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
            aria-label="Upload chart data"
          />
        }
      >
        <Upload className="size-5" />
      </DialogTrigger>
      <DialogContent
        className="relative max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-md gap-0 overflow-y-auto rounded-2xl p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-white/10 px-4 py-4 pr-14">
          <DialogTitle className="font-display text-2xl text-white">Upload chart</DialogTitle>
          <DialogDescription className="text-stone-400">
            Scan a QR or paste a Google Drive share link to load the chart PDF.
          </DialogDescription>
          <button
            type="button"
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Close upload"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </DialogHeader>

        <div className="space-y-3 px-4 py-5">
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

          <div className="space-y-2 border-t border-white/10 pt-3">
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

          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full rounded-xl text-stone-300"
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
