"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HelpTopic } from "@/lib/help-guide";
import { cn } from "cn";

const SWIPE_MIN_PX = 48;

export function HelpGuide({
  topics,
  className,
  onTopicOpenChange,
}: {
  topics: HelpTopic[];
  className?: string;
  /** So Settings can blur and disable the page behind the topic popup. */
  onTopicOpenChange?: (open: boolean) => void;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onTopicOpenChange?.(index != null);
  }, [index, onTopicOpenChange]);

  useEffect(() => {
    return () => onTopicOpenChange?.(false);
  }, [onTopicOpenChange]);

  if (topics.length === 0) return null;

  const open = index != null;
  const safeIndex =
    index == null ? 0 : Math.min(Math.max(0, index), topics.length - 1);
  const topic = topics[safeIndex]!;
  const prevDisabled = safeIndex <= 0;
  const nextDisabled = safeIndex >= topics.length - 1;

  function goPrev() {
    setIndex((prev) => {
      if (prev == null) return prev;
      return Math.max(0, prev - 1);
    });
  }

  function goNext() {
    setIndex((prev) => {
      if (prev == null) return prev;
      return Math.min(topics.length - 1, prev + 1);
    });
  }

  function onTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || index == null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    // Swipe left → next, swipe right → previous.
    if (dx < 0) goNext();
    else goPrev();
  }

  return (
    <>
      <ul
        className={cn(
          "divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-black/20",
          className,
        )}
      >
        {topics.map((item, topicIndex) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setIndex(topicIndex)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-white/5"
            >
              <span className="min-w-0 font-medium text-white">{item.title}</span>
              <ChevronRight
                className="size-4 shrink-0 text-stone-500"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setIndex(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[70] bg-black/55 supports-backdrop-filter:backdrop-blur-sm"
          className="z-[70] flex h-[min(32rem,85dvh)] w-[calc(100%-1.25rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-white/10 px-4 py-3 pr-14">
            <DialogTitle className="font-display text-xl text-white">
              Help
            </DialogTitle>
            <DialogDescription className="text-sm text-stone-400">
              {safeIndex + 1} of {topics.length} · swipe for previous or next
            </DialogDescription>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Close help topic"
              onClick={() => setIndex(null)}
            >
              <X className="size-5" />
            </button>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-label="Previous help topic"
                disabled={prevDisabled}
                onClick={goPrev}
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-card text-white transition-colors",
                  prevDisabled
                    ? "opacity-35"
                    : "hover:bg-white/10 active:bg-white/15",
                )}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-stone-300">
                {topic.title}
              </p>
              <button
                type="button"
                aria-label="Next help topic"
                disabled={nextDisabled}
                onClick={goNext}
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-card text-white transition-colors",
                  nextDisabled
                    ? "opacity-35"
                    : "hover:bg-white/10 active:bg-white/15",
                )}
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-stone-300">
                {topic.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
