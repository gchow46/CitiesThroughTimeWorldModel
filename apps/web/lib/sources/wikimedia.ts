import type { SeedCandidate } from "@/lib/types";
import { fetchJson } from "@/lib/http";
import type { SeedSource, SourceQuery } from "./index";

const API = "https://commons.wikimedia.org/w/api.php";
const MIN_WIDTH = 800;
/** Must be croppable to a 16:9 landscape — hard-reject deep portraits. */
const MIN_ASPECT = 1.0;
const YEAR_FLEX = 2; // accept [decade-2, decade+11]

const LICENSE_OK = /public domain|cc0|cc[ -]by([ -]sa)?[ -][\d.]|cc[ -]by$|pd[ -]mark/i;
const LICENSE_BAD = /nc|nd|noncommercial|no[ -]deriv/i;

interface CommonsImageInfo {
  url: string;
  width: number;
  height: number;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface CommonsPage {
  title: string;
  imageinfo?: CommonsImageInfo[];
  categories?: { title: string }[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

function extractYear(meta?: Record<string, { value?: string }>): number | undefined {
  const raw = meta?.DateTimeOriginal?.value ?? meta?.DateTime?.value ?? "";
  const m = raw.match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

function stripHtml(s: string | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, "").trim();
}

function licenseOk(short: string): boolean {
  return LICENSE_OK.test(short) && !LICENSE_BAD.test(short);
}

export function pagesToCandidates(
  pages: Record<string, CommonsPage> | undefined,
  decade: number,
): SeedCandidate[] {
  const out: SeedCandidate[] = [];
  for (const p of Object.values(pages ?? {})) {
    const info = p.imageinfo?.[0];
    if (!info?.url || info.width < MIN_WIDTH || info.width / info.height < MIN_ASPECT) continue;

    const meta = info.extmetadata;
    const license = stripHtml(meta?.LicenseShortName?.value);
    if (!licenseOk(license)) continue;

    const year = extractYear(meta);
    if (year !== undefined && (year < decade - YEAR_FLEX || year > decade + 9 + YEAR_FLEX))
      continue;

    out.push({
      url: info.url,
      source: "wikimedia",
      year,
      title: stripHtml(meta?.ImageDescription?.value) || p.title.replace(/^File:/, ""),
      author: stripHtml(meta?.Artist?.value) || undefined,
      license: license || undefined,
      sourceUrl: info.descriptionurl,
      width: info.width,
      height: info.height,
      licenseConfidence: "high",
    });
  }
  return out;
}

async function commonsQuery(
  params: Record<string, string>,
): Promise<Record<string, CommonsPage> | undefined> {
  const u = new URL(API);
  u.searchParams.set("action", "query");
  u.searchParams.set("format", "json");
  u.searchParams.set("prop", "imageinfo|categories");
  u.searchParams.set("cllimit", "50");
  u.searchParams.set("iiprop", "url|size|extmetadata");
  u.searchParams.set("iilimit", "1");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const data = await fetchJson<CommonsResponse>(u.toString());
  return data.query?.pages;
}

export const wikimediaSource: SeedSource = {
  id: "wikimedia",
  async search(q: SourceQuery): Promise<SeedCandidate[]> {
    const [byText, byGeo] = await Promise.allSettled([
      commonsQuery({
        generator: "search",
        gsrnamespace: "6",
        gsrsearch: `"${q.cityName}" ${q.decade}s`,
        gsrlimit: "50",
      }),
      commonsQuery({
        generator: "geosearch",
        ggsnamespace: "6",
        ggscoord: `${q.lat}|${q.lon}`,
        ggsradius: "10000",
        ggslimit: "50",
      }),
    ]);

    const seen = new Set<string>();
    const out: SeedCandidate[] = [];
    for (const r of [byText, byGeo]) {
      if (r.status !== "fulfilled") continue;
      for (const c of pagesToCandidates(r.value, q.decade)) {
        if (!seen.has(c.url)) {
          seen.add(c.url);
          out.push(c);
        }
      }
    }
    return out;
  },
};
