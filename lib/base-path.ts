/** Prefix app-root paths when hosted under a repo subpath (GitHub Pages). */
export function withBasePath(path: string) {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}
