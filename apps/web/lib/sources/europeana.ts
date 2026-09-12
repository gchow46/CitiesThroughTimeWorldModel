import type { SeedCandidate } from "@/lib/types";
import { fetchJson } from "@/lib/http";
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
}

interface EuropeanaResponse {
  items?: EuropeanaItem[];
}

function first(a?: string[]): string | undefined {
  return a?.[0];
}

export function itemsToCandidates(items: EuropeanaItem[] | undefined): SeedCandidate[] {
  const out: SeedCandidate[] = [];
  for (const it of items ?? []) {
    const url = first(it.edmIsShownBy);
    if (!url) continue;
    const yearRaw = first(it.year);
    const year = yearRaw && /^\d{4}/.test(yearRaw) ? Number(yearRaw.slice(0, 4)) : undefined;
    out.push({
      url,
      source: "europeana",
      year,
      title: first(it.title),
      author: first(it.dcCreator),
      license: first(it.rights),
      sourceUrl: it.guid,
      licenseConfidence: "high",
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
    return itemsToCandidates(data.items);
  },
};
