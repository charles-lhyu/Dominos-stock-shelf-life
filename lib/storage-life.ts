/**
 * When the chart splits the prepped column into chilled / ambient cells,
 * route each cell by its wording into prepped (chilled) or ambientUse.
 */

function lifeUnit(raw: string) {
  return /^days?$/i.test(raw) ? "days" : "hours";
}

function durationMatch(
  text: string,
  storage: "chilled" | "ambient",
): { amount: string; unit: string } | null {
  const after = text.match(
    new RegExp(`(\\d+)\\s*(hours?|days?)\\s*(?:\\()?${storage}(?:\\))?`, "i"),
  );
  if (after) return { amount: after[1]!, unit: after[2]! };
  const before = text.match(
    new RegExp(`${storage}[^0-9]{0,12}(\\d+)\\s*(hours?|days?)`, "i"),
  );
  if (before) return { amount: before[1]!, unit: before[2]! };
  return null;
}

/** Read chilled / ambient lives from cell text that names the storage state. */
export function livesFromChilledAmbientWording(text: string): {
  chilled?: string;
  ambient?: string;
} {
  const chilledHit = durationMatch(text, "chilled");
  const ambientHit = durationMatch(text, "ambient");
  return {
    chilled: chilledHit
      ? `${chilledHit.amount} ${lifeUnit(chilledHit.unit)} chilled`
      : undefined,
    // Ambient field stores duration only; the ambient clock carries the kind.
    ambient: ambientHit
      ? `${ambientHit.amount} ${lifeUnit(ambientHit.unit)}`
      : undefined,
  };
}

function hourAmounts(text: string) {
  return [...text.matchAll(/(\d+)\s*hours?/gi)].map((match) => match[1]!);
}

/**
 * Split a joined prepped cell (or prepped + ambient pair) using chilled/ambient
 * wording. Unlabeled companion hours keep the other chart field when present.
 */
export function splitPreppedAmbientFields(
  prepped: string | undefined,
  ambientUse: string | undefined,
  window = [prepped, ambientUse].filter(Boolean).join(" "),
): { prepped?: string; ambientUse?: string } {
  const wording = livesFromChilledAmbientWording(window);
  if (!wording.chilled && !wording.ambient) {
    return { prepped, ambientUse };
  }

  let nextPrepped = prepped;
  let nextAmbient = ambientUse;

  if (wording.chilled) nextPrepped = wording.chilled;
  if (wording.ambient) nextAmbient = wording.ambient;

  const hours = hourAmounts(window);
  if (wording.chilled && !wording.ambient && hours.length >= 2) {
    const chilledN = wording.chilled.match(/^(\d+)/)?.[1];
    const other = hours.find((amount) => amount !== chilledN);
    if (other) nextAmbient = `${other} hours`;
  }
  if (wording.ambient && !wording.chilled && hours.length >= 2) {
    const ambientN = wording.ambient.match(/^(\d+)/)?.[1];
    const other = hours.find((amount) => amount !== ambientN);
    if (other) nextPrepped = `${other} hours chilled`;
  }

  return { prepped: nextPrepped, ambientUse: nextAmbient };
}
