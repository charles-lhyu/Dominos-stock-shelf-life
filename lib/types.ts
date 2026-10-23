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

export type ChartMeta = {
  title: string;
  audience: string;
  version: string;
  issued: string;
  validUntil: string;
};

export type ChartSection = {
  id: SectionId;
  title: string;
  short: string;
  note: string;
};

export type ChartPack = {
  chart: ChartMeta;
  sections: ChartSection[];
  footnotes: string[];
  rules: ShelfRule[];
};
