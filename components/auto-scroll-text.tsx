"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "cn";

type AutoScrollTextProps = {
  children: string;
  className?: string;
};

const STYLE_ID = "auto-scroll-text-keyframes";

function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes auto-scroll-text-x {
  0%, 15% { transform: translateX(0); }
  45%, 60% { transform: translateX(var(--auto-scroll-distance, 0px)); }
  90%, 100% { transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .auto-scroll-text-active {
    animation: none !important;
    transform: none !important;
  }
}
`;
  document.head.appendChild(style);
}

/**
 * Single-line label. When the name is wider than its slot, scrolls it
 * back and forth so the full text can be read.
 */
export function AutoScrollText({ children, className }: AutoScrollTextProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    ensureKeyframes();
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;

    const apply = () => {
      // Inner stays nowrap so scrollWidth is the full name (never truncate).
      const overflow = Math.max(0, Math.ceil(text.scrollWidth - wrap.clientWidth));
      if (overflow <= 1) {
        wrap.dataset.autoScroll = "0";
        wrap.removeAttribute("title");
        text.classList.remove("auto-scroll-text-active");
        text.style.removeProperty("--auto-scroll-distance");
        text.style.removeProperty("animation");
        text.style.transform = "";
        return;
      }

      const travelSec = Math.min(10, Math.max(2.5, overflow / 40));
      const durationSec = travelSec * 2 + 2.5;

      wrap.dataset.autoScroll = "1";
      wrap.title = children;
      text.style.setProperty("--auto-scroll-distance", `-${overflow}px`);
      text.classList.add("auto-scroll-text-active");
      text.style.animation = `auto-scroll-text-x ${durationSec}s linear infinite`;
    };

    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(wrap);
    ro.observe(text);
    return () => {
      ro.disconnect();
      text.classList.remove("auto-scroll-text-active");
      text.style.removeProperty("animation");
      text.style.removeProperty("--auto-scroll-distance");
      text.style.transform = "";
    };
  }, [children]);

  return (
    <span
      ref={wrapRef}
      data-auto-scroll="0"
      className={cn("block min-w-0 overflow-hidden", className)}
    >
      <span
        ref={textRef}
        className="inline-block max-w-none whitespace-nowrap"
      >
        {children}
      </span>
    </span>
  );
}
