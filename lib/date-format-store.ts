const listeners = new Set<() => void>();

let compact = false;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeDateFormat(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCompactDateFormat() {
  return compact;
}

export function setCompactDateFormat(next: boolean) {
  if (compact === next) return;
  compact = next;
  emit();
}

export function toggleCompactDateFormat() {
  setCompactDateFormat(!compact);
}
