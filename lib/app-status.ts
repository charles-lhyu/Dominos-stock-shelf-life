export type AppStatusKind = "updated" | "up-to-date";

type Listener = (kind: AppStatusKind) => void;

let listener: Listener | null = null;

/** Subscribe the bottom status popup (one listener). */
export function subscribeAppStatus(next: Listener) {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export function showAppStatus(kind: AppStatusKind) {
  listener?.(kind);
}
