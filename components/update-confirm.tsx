"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAppVersion } from "@/lib/changelog";

export function UpdateConfirmDialog({
  open,
  onOpenChange,
  localVersion,
  remoteVersion,
  notes,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localVersion: string;
  remoteVersion: string;
  notes: string[];
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[70] bg-black/50"
        className="z-[70] flex max-h-[min(32rem,85dvh)] w-[calc(100%-1.25rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm"
      >
        <DialogHeader className="shrink-0 space-y-2 border-b border-white/10 px-4 pt-4 pb-3">
          <DialogTitle className="font-display text-xl text-white">
            Update to {formatAppVersion(remoteVersion)}?
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-400">
            {formatAppVersion(localVersion)} →{" "}
            {formatAppVersion(remoteVersion)}. Chart data on this device is
            kept.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            What&apos;s new
          </p>
          {notes.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-stone-300">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">
              No release notes for this build.
            </p>
          )}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 p-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-white/15 text-white"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 rounded-xl bg-orange-500 text-orange-950 hover:bg-orange-400"
            disabled={busy}
            onClick={onConfirm}
          >
            <RefreshCw
              className={`size-4 ${busy ? "animate-spin" : ""}`}
              aria-hidden
            />
            {busy ? "Updating…" : "Update"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
