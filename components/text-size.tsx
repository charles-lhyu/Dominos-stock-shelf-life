"use client";

import { useEffect } from "react";
import {
  getTextSize,
  hydrateTextSizeStore,
  subscribeTextSize,
  type TextSize,
} from "@/lib/text-size-store";

/** Absolute root sizes so rem utilities (text-sm, etc.) scale with Settings. */
const ROOT_FONT_SIZE: Record<TextSize, string> = {
  sm: "15px",
  md: "16px",
  lg: "18px",
};

function applyTextSize(size: TextSize) {
  const root = document.documentElement;
  root.dataset.textSize = size;
  root.style.fontSize = ROOT_FONT_SIZE[size];
}

/**
 * Applies the Settings text-size preference on `<html>` so rem-based
 * Tailwind text utilities scale across the desk.
 */
export function TextSizeControl() {
  useEffect(() => {
    hydrateTextSizeStore();
    applyTextSize(getTextSize());
    return subscribeTextSize(() => {
      applyTextSize(getTextSize());
    });
  }, []);

  return null;
}
