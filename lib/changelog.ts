export type ChangelogEntry = {
  version: string;
  /** Short bullets for that release. Empty = version-only notice. */
  notes: string[];
};

/**
 * Newest first. Add a block whenever you bump package.json.
 * Notes are optional — omit or leave empty for a version-only line.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.4.12",
    notes: [
      "Changelog button and version browser in Settings",
      "Update notice shows this build’s release notes",
      "Fix GitHub Pages deploy TypeScript check",
    ],
  },
  {
    version: "1.4.11",
    notes: [
      "Settings section chips with scroll spy and App details",
      "Desk stays empty until a chart is imported",
      "Bottom toasts for import success and read errors",
      "Clear-chart confirmation popup",
      "Sort controls only on the top sticky category header",
    ],
  },
  {
    version: "1.4.10",
    notes: [
      "PDF row crops on the desk",
      "Combined delivery and prep dates",
      "Hide products from the list",
      "Section tools and sticky category headers",
    ],
  },
];

export function appSemver(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? CHANGELOG[0]?.version ?? "0.0.0";
}

export function formatAppVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function parseParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Compare semver-ish strings: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const left = parseParts(a);
  const right = parseParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function changelogForVersion(version: string): ChangelogEntry | null {
  const needle = version.replace(/^v/i, "");
  return (
    CHANGELOG.find((entry) => entry.version.replace(/^v/i, "") === needle) ??
    null
  );
}

/** Entries newer than `fromVersion` up to and including `toVersion` (newest first). */
export function changelogsSince(
  fromVersion: string | null | undefined,
  toVersion: string,
): ChangelogEntry[] {
  const to = toVersion.replace(/^v/i, "");
  return CHANGELOG.filter((entry) => {
    const v = entry.version.replace(/^v/i, "");
    if (compareVersions(v, to) > 0) return false;
    if (fromVersion == null || fromVersion === "") return v === to;
    return compareVersions(v, fromVersion.replace(/^v/i, "")) > 0;
  });
}

export function recentChangelogs(limit = 5): ChangelogEntry[] {
  return CHANGELOG.slice(0, Math.max(1, limit));
}
