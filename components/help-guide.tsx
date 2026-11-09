"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, List, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HELP_GUIDE, type HelpTopic } from "@/lib/help-guide";
import { cn } from "cn";

const SWIPE_MIN_PX = 48;

function HelpTitleControl({
  inDetail,
  onGoList,
  size = "popup",
}: {
  inDetail: boolean;
  onGoList: () => void;
  size?: "popup" | "settings";
}) {
  const popup = size === "popup";
  return (
    <button
      type="button"
      disabled={!inDetail}
      onClick={onGoList}
      className={cn(
        "inline-flex max-w-full items-center text-left transition-colors disabled:pointer-events-none disabled:opacity-100",
        popup
          ? "gap-2 rounded-xl border px-2.5 py-1.5 font-display text-xl text-white"
          : "gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold uppercase tracking-wider",
        inDetail
          ? popup
            ? "border-white/15 bg-white/10 hover:bg-white/15 active:bg-white/20"
            : "border-white/15 bg-white/10 text-stone-200 hover:bg-white/15 hover:text-white active:bg-white/20"
          : popup
            ? "border-transparent bg-transparent"
            : "border-transparent bg-transparent text-stone-500",
      )}
      aria-label={inDetail ? "Back to topic list" : "Help"}
      title={inDetail ? "Topics" : undefined}
    >
      <List
        className={cn(
          "shrink-0",
          popup ? "size-5 opacity-80" : "size-3.5",
        )}
        aria-hidden
      />
      <span>Help</span>
    </button>
  );
}

/** Standalone Help dialog: topic list and detail share one popup. */
export function HelpPopup({
  open,
  onOpenChange,
  topics = HELP_GUIDE,
  topicIndex: topicIndexProp,
  onTopicIndexChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics?: HelpTopic[];
  /** Controlled topic index; `null` shows the list. */
  topicIndex?: number | null;
  onTopicIndexChange?: (index: number | null) => void;
}) {
  const [uncontrolledIndex, setUncontrolledIndex] = useState<number | null>(
    null,
  );
  const controlled = onTopicIndexChange != null;
  const index = controlled ? (topicIndexProp ?? null) : uncontrolledIndex;
  const setIndex = controlled ? onTopicIndexChange : setUncontrolledIndex;

  useEffect(() => {
    if (!open && !controlled) setUncontrolledIndex(null);
  }, [open, controlled]);

  const inDetail = index != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[70] bg-black/55 supports-backdrop-filter:backdrop-blur-sm"
        className="z-[70] flex h-[min(32rem,85dvh)] w-[calc(100%-1.25rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-white/10 px-4 py-3 pr-14">
          <DialogTitle className="font-display text-xl text-white">
            <HelpTitleControl
              inDetail={inDetail}
              onGoList={() => setIndex(null)}
              size="popup"
            />
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-400">
            {inDetail
              ? "Swipe for previous or next · pick a topic from the menu"
              : "Tap a topic for details"}
          </DialogDescription>
          <button
            type="button"
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Close help"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" />
          </button>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          {open ? (
            <HelpGuide
              topics={topics}
              index={index}
              onIndexChange={setIndex}
              showListButton={false}
              className="min-h-0 flex-1"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HelpGuide({
  topics,
  className,
  index: indexProp,
  onIndexChange,
  onTopicOpenChange,
  showListButton = true,
}: {
  topics: HelpTopic[];
  className?: string;
  /** Controlled topic index; `null` shows the list. */
  index?: number | null;
  onIndexChange?: (index: number | null) => void;
  /** Fired when detail is shown (for hosts that still track overlay state). */
  onTopicOpenChange?: (open: boolean) => void;
  /** When false, host owns the list/home control (e.g. Help popup header). */
  showListButton?: boolean;
}) {
  const [uncontrolledIndex, setUncontrolledIndex] = useState<number | null>(
    null,
  );
  const controlled = onIndexChange != null;
  const index = controlled ? (indexProp ?? null) : uncontrolledIndex;
  const setIndex = controlled ? onIndexChange : setUncontrolledIndex;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onTopicOpenChange?.(index != null);
  }, [index, onTopicOpenChange]);

  useEffect(() => {
    return () => onTopicOpenChange?.(false);
  }, [onTopicOpenChange]);

  if (topics.length === 0) return null;

  const inDetail = index != null;
  const safeIndex = inDetail
    ? Math.min(Math.max(0, index), topics.length - 1)
    : 0;
  const topic = topics[safeIndex]!;
  const prevDisabled = safeIndex <= 0;
  const nextDisabled = safeIndex >= topics.length - 1;
  const topicItems = topics.map((item) => ({
    value: item.id,
    label: item.title,
  }));

  function goHome() {
    setIndex(null);
  }

  function goPrev() {
    if (!inDetail) return;
    setIndex(Math.max(0, safeIndex - 1));
  }

  function goNext() {
    if (!inDetail) return;
    setIndex(Math.min(topics.length - 1, safeIndex + 1));
  }

  function onTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !inDetail) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  if (!inDetail) {
    return (
      <div className={cn("min-h-0 overflow-y-auto", className)}>
        <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          {topics.map((item, topicIndex) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setIndex(topicIndex)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-white/5"
              >
                <span className="min-w-0 font-medium text-white">
                  {item.title}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-stone-500"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {showListButton ? (
        <HelpTitleControl inDetail onGoList={goHome} size="settings" />
      ) : null}
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
        <Select
          value={topic.id}
          items={topicItems}
          onValueChange={(next) => {
            if (typeof next !== "string") return;
            const found = topics.findIndex((item) => item.id === next);
            if (found >= 0) setIndex(found);
          }}
        >
          <SelectTrigger
            aria-label="Help topic"
            className="h-10 min-w-0 flex-1 rounded-xl border-white/10 bg-card px-2 text-sm font-medium text-white hover:bg-white/[0.06] focus-visible:border-white/25 focus-visible:ring-white/15 dark:bg-card dark:hover:bg-white/[0.06] [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="center" className="min-w-[12rem]">
            {topics.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  );
}
