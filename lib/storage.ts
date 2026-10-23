import type { StockBook } from "./types";

export const BOOK_KEY = "domino-stock-dates.book.v1";
export const BEEP_KEY = "domino-stock-dates.beep";

export function loadBook(): StockBook | null {
  try {
    const raw = localStorage.getItem(BOOK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StockBook;
    if (!parsed || !Array.isArray(parsed.lines) || !parsed.fileName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBook(book: StockBook): void {
  localStorage.setItem(BOOK_KEY, JSON.stringify(book));
}

export function clearBook(): void {
  localStorage.removeItem(BOOK_KEY);
}
