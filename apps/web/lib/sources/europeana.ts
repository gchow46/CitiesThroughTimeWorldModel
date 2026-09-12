import type { SeedCandidate, SeedLocation } from "@/lib/types";
import { fetchJson } from "@/lib/http";
import { isGeoPoint, locationForPoint, type SourceGeoContext } from "@/lib/location";
import type { SeedSource, SourceQuery } from "./index";

const API = "https://api.europeana.eu/record/v2/search.json";

interface EuropeanaItem {
  title?: string[];
  edmIsShownBy?: string[];
  edmPreview?: string[];
  year?: string[];
  dcCreator?: string[];
  rights?: string[];
  guid?: string;
  dataProvider?: string[];
  /** Coordinates of the edm:Place associated with the item, when present. */
  edmPlaceLatitude?: string[];
  edmPlaceLongitude?: string[];
}

interface EuropeanaResponse {
  items?: EuropeanaItem[];
}

function first(a?: string[]): string | undefined {
  return a?.[0];
}

/**
 * Europeana's edmPlaceLatitude/Longitude describe the place associated with
 * the item — not necessarily the camera. We propagate them only when they
 * are explicit, attributable (the item has a record URL) and parse cleanly;
 * the role stays "unknown". Missing coordinates are a supported result.
 */
function locationFromItem(it: EuropeanaItem, geo?: SourceGeoContext): SeedLocation | undefined {
  try {
    const evidenceUrl = it.guid;
    if (!evidenceUrl) return undefined;
    const lat = Number(first(it.edmPlaceLatitude));
    const lng = Number(first(it.edmPlaceLongitude));
    const point = { lat, lng };
    if (!isGeoPoint(point)) return undefined;
    return locationForPoint(point, geo, {
      role: "unknown",
      provenance: "archive",
      evidenceUrl,
      label: "place associated with the record",
    });
  } catch {
    return undefined;
  }
}

export function itemsToCandidates(
  items: EuropeanaItem[] | undefined,
  geo?: SourceGeoContext,
): SeedCandidate[] {
  const out: SeedCandidate[] = [];
  for (const it of items ?? []) {
    const url = first(it.edmIsShownBy);
    if (!url) continue;
    const yearRaw = first(it.year);
    const year = yearRaw && /^\d{4}/.test(yearRaw) ? Number(yearRaw.slice(0, 4)) : undefined;
    const location = locationFromItem(it, geo);
    out.push({
      url,
      source: "europeana",
      year,
      title: first(it.title),
      author: first(it.dcCreator),
      license: first(it.rights),
      sourceUrl: it.guid,
      licenseConfidence: "high",
      ...(location ? { location } : {}),
    });
  }
  return out;
}

export const europeanaSource: SeedSource = {
  id: "europeana",
  async search(q: SourceQuery): Promise<SeedCandidate[]> {
    const key = process.env.EUROPEANA_KEY;
    if (!key) return []; // feature-flag off without key

    const u = new URL(API);
    u.searchParams.set("wskey", key);
    u.searchParams.set("query", `"${q.cityName}"`);
    u.searchParams.set("qf", `YEAR:[${q.decade} TO ${q.decade + 9}]`);
    u.searchParams.append("qf", "TYPE:IMAGE");
    u.searchParams.append("qf", "reusability:open");
    u.searchParams.set("rows", "50");

    const data = await fetchJson<EuropeanaResponse>(u.toString());
    return itemsToCandidates(data.items, { bbox: q.bbox });
  },
};
