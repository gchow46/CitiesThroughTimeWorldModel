import type { SeedCandidate } from "@/lib/types";
import { fetchJson } from "@/lib/http";
import type { SeedSource, SourceQuery } from "./index";

const API = "https://www.googleapis.com/customsearch/v1";
let callsToday = 0;
let callsDay = new Date().toDateString();

function logQuota() {
  const today = new Date().toDateString();
  if (today !== callsDay) {
    callsDay = today;
    callsToday = 0;
  }
  callsToday += 1;
  console.warn(`[sources] google-cse call #${callsToday} today (free quota ≈100/day)`);
}

interface CseItem {
  link?: string;
  title?: string;
  displayLink?: string;
  image?: { width?: number; height?: number; contextLink?: string };
}

interface CseResponse {
  items?: CseItem[];
}

export function itemsToCandidates(items: CseItem[] | undefined): SeedCandidate[] {
  return (items ?? [])
    .filter((i) => i.link)
    .map((i) => ({
      url: i.link!,
      source: "google-cse" as const,
      title: i.title,
      sourceUrl: i.image?.contextLink,
      width: i.image?.width,
      height: i.image?.height,
      licenseConfidence: "low" as const,
    }));
}

/**
 * Google Custom Search JSON API — invoked ONLY when archive candidates are
 * below MIN_CANDIDATES. Results are licenseConfidence:'low' and the ranker
 * keeps them below archive results.
 */
export const googleCseSource: SeedSource = {
  id: "google-cse",
  async search(q: SourceQuery): Promise<SeedCandidate[]> {
    const key = process.env.GOOGLE_CSE_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) return [];

    const u = new URL(API);
    u.searchParams.set("key", key);
    u.searchParams.set("cx", cx);
    u.searchParams.set("searchType", "image");
    u.searchParams.set("imgSize", "large");
    u.searchParams.set("rights", "cc_publicdomain|cc_attribute|cc_sharealike");
    u.searchParams.set("q", `${q.cityName} ${q.decade}s street photo`);
    u.searchParams.set("num", "10");

    logQuota();
    const data = await fetchJson<CseResponse>(u.toString());
    return itemsToCandidates(data.items);
  },
};
