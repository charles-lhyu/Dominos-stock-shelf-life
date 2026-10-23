"use client";

import {
  useRef,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "cn";

type DragScrollProps = {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">;

const DRAG_THRESHOLD = 8;

/**
 * Horizontal chip scroller. Touch uses native scrolling (so the page can
 * still scroll vertically). Mouse can click-drag to pan.
 */
export function DragScroll({ children, className, ...props }: DragScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    dragging: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Touch / pen: leave gestures to the browser so vertical page scroll works.
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const node = ref.current;
    if (!node) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: node.scrollLeft,
      dragging: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const node = ref.current;
    if (!state || !node || event.pointerId !== state.pointerId) return;

    const delta = event.clientX - state.startX;
    if (!state.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      state.dragging = true;
      suppressClick.current = true;
      node.setPointerCapture(event.pointerId);
    }

    node.scrollLeft = state.startScroll - delta;
    event.preventDefault();
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const node = ref.current;
    if (!state || event.pointerId !== state.pointerId) return;

    if (state.dragging && node?.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      {...props}
      ref={ref}
      data-drag-scroll=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      className={cn(
        "flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
