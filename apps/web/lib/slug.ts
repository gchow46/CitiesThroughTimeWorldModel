/** "Amsterdam, Netherlands" → "amsterdam"; "New York, US" → "new-york". */
export function citySlug(canonicalName: string): string {
  return canonicalName
    .split(",")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
