export type StockStatus =
  | "expired"
  | "today"
  | "critical"
  | "soon"
  | "watch"
  | "ok"
  | "missing";

export type SectionId = "frozen" | "chilled" | "ready" | "ambient" | "pack";

export type ShelfAlso = {
  label: string;
  value: string;
};

export type ShelfRule = {
  id: string;
  sectionId: SectionId;
  category: string;
  name: string;
  aliases: string[];
  sameAs: string[];
  fromDelivery?: string;
  inUse?: string;
  unopened?: string;
  prepped?: string;
  ambientUse?: string;
  also?: ShelfAlso;
  note?: string;
};
