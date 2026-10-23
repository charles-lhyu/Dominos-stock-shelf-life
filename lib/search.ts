import { RULES } from "./chart";
import type { ShelfRule } from "./types";

export function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type NameHit = {
  name: string;
  score: number;
};

function scoreName(rule: ShelfRule, query: string): number {
  const name = fold(rule.name);
  const aliases = rule.aliases.map(fold);
  const words = query.split(" ").filter(Boolean);
  if (name === query) return 0;
  if (aliases.some((alias) => alias === query)) return 1;
  if (query.length >= 2 && (name.startsWith(query) || aliases.some((alias) => alias.startsWith(query)))) {
    return 2;
  }
  const haystack = `${name} ${aliases.join(" ")}`;
  if (words.length > 0 && words.every((word) => haystack.split(" ").includes(word) || haystack.includes(word))) {
    if (words.every((word) => name.includes(word) || aliases.some((alias) => alias.includes(word)))) {
      return 3;
    }
  }
  if (query.length >= 3 && (name.includes(query) || aliases.some((alias) => alias.includes(query)))) {
    return 4;
  }
  if (fold(rule.category) === query) return 5;
  return -1;
}

export function searchNames(query: string, rules: ShelfRule[] = RULES): NameHit[] {
  const folded = fold(query);
  if (folded.length < 2) return [];

  const best = new Map<string, number>();
  for (const rule of rules) {
    const score = scoreName(rule, folded);
    if (score < 0) continue;
    const key = fold(rule.name);
    const current = best.get(key);
    if (current == null || score < current) best.set(key, score);
  }

  return [...best.entries()]
    .map(([nameKey, score]) => {
      const rule = rules.find((item) => fold(item.name) === nameKey);
      return { name: rule?.name ?? nameKey, score };
    })
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
}

export function shouldExpand(hits: NameHit[]): boolean {
  if (hits.length === 0) return false;
  if (hits.length === 1) return true;
  return hits[0].score <= 1 && (hits[1]?.score ?? 99) > 1;
}

export function rulesForName(name: string, rules: ShelfRule[] = RULES): ShelfRule[] {
  const folded = fold(name);
  return rules.filter((rule) => fold(rule.name) === folded);
}
