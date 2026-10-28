const listeners = new Set<() => void>();

let compact = false;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeCompactList(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCompactList() {
  return compact;
}

export function setCompactList(next: boolean) {
  if (compact === next) return;
  compact = next;
  emit();
}
