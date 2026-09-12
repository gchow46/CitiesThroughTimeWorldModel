import type { SeedCandidate } from "@/lib/types";
import { fetchJson } from "@/lib/http";
import type { SeedSource, SourceQuery } from "./index";

const API = "https://api.flickr.com/services/rest/";

/** Flickr license ids we accept: 4=CC BY, 5=CC BY-SA, 7=PD, 9=CC0, 10=PDM. */
const LICENSES = "4,5,7,9,10";
const LICENSE_NAME: Record<string, string> = {
  "4": "CC BY 2.0",
  "5": "CC BY-SA 2.0",
  "7": "Public Domain",
  "9": "CC0",
  "10": "Public Domain Mark",
};

interface FlickrPhoto {
  id: string;
  server: string;
  secret: string;
  url_l?: string;
  url_o?: string;
  width_l?: number;
  height_l?: number;
  title?: string;
  ownername?: string;
  license?: string;
  datetaken?: string;
}

interface FlickrResponse {
  photos?: { photo?: FlickrPhoto[] };
  stat?: string;
}

function imageUrl(p: FlickrPhoto): string | undefined {
  if (p.url_o) return p.url_o;
  if (p.url_l) return p.url_l;
  if (p.server && p.secret)
    return `https://live.staticflickr.com/${p.server}/${p.id}_${p.secret}_b.jpg`;
  return undefined;
}

export function photosToCandidates(photos: FlickrPhoto[] | undefined): SeedCandidate[] {
  const out: SeedCandidate[] = [];
  for (const p of photos ?? []) {
    const url = imageUrl(p);
    if (!url) continue;
    const year = p.datetaken ? Number(p.datetaken.slice(0, 4)) : undefined;
    out.push({
      url,
      source: "flickr",
      year: Number.isFinite(year) ? year : undefined,
      title: p.title,
      author: p.ownername,
      license: p.license ? LICENSE_NAME[p.license] : undefined,
      sourceUrl: `https://www.flickr.com/photos/_/${p.id}`,
      width: p.width_l,
      height: p.height_l,
      licenseConfidence: "high",
    });
  }
  return out;
}

export const flickrSource: SeedSource = {
  id: "flickr",
  async search(q: SourceQuery): Promise<SeedCandidate[]> {
    const key = process.env.FLICKR_KEY;
    if (!key) return [];

    const u = new URL(API);
    u.searchParams.set("method", "flickr.photos.search");
    u.searchParams.set("api_key", key);
    u.searchParams.set("license", LICENSES);
    u.searchParams.set("min_taken_date", `${q.decade}-01-01`);
    u.searchParams.set("max_taken_date", `${q.decade + 9}-12-31`);
    u.searchParams.set("text", q.cityName);
    u.searchParams.set("content_type", "1"); // photos only
    u.searchParams.set("extras", "url_o,url_l,owner_name,license,date_taken");
    u.searchParams.set("format", "json");
    u.searchParams.set("nojsoncallback", "1");
    u.searchParams.set("per_page", "50");

    const data = await fetchJson<FlickrResponse>(u.toString());
    return photosToCandidates(data.photos?.photo);
  },
};
