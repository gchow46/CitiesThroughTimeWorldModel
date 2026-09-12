import type { SeedCandidate, SeedLocation } from "@/lib/types";
import { fetchJson } from "@/lib/http";
import {
  locationForPoint,
  normalizeHeadingDeg,
  safeEvidenceUrl,
  type SourceGeoContext,
} from "@/lib/location";
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
  /**
   * prop=coordinates entries. `primary` is set for the primary coordinate,
   * which on file pages usually comes from the camera Location template —
   * but the API does not expose that semantics explicitly, so we stay
   * conservative and treat record coordinates as role "unknown".
   */
  coordinates?: { lat?: number; lon?: number; primary?: string; globe?: string }[];
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

/**
 * Parse a GPS coordinate from extmetadata. Commons emits either a plain
 * decimal ("52.369806") or a DMS string ("52° 22′ 11.3″ N"); hemisphere
 * letters win over the sign. Anything unparseable yields undefined.
 */
function parseGpsCoord(
  raw: string | undefined,
  positiveHemisphere: string,
  negativeHemisphere: string,
): number | undefined {
  if (!raw) return undefined;
  const s = stripHtml(raw).trim();
  if (!s) return undefined;

  const dec = s.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i);
  if (dec) {
    let v = Number(dec[1]);
    const hemi = dec[2]?.toUpperCase();
    if (hemi === negativeHemisphere) v = -Math.abs(v);
    else if (hemi === positiveHemisphere) v = Math.abs(v);
    return Number.isFinite(v) ? v : undefined;
  }

  const dms = s.match(
    /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′′])?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|''))?\s*([NSEW])?/i,
  );
  if (dms) {
    let v = Number(dms[1]) + Number(dms[2] ?? 0) / 60 + Number(dms[3] ?? 0) / 3600;
    const hemi = dms[4]?.toUpperCase();
    if (hemi === negativeHemisphere) v = -v;
    else if (hemi === positiveHemisphere) v = Math.abs(v);
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

/** EXIF GPSImgDirection is a camera heading; values may be decimal or n/d rationals. */
function parseGpsHeading(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = stripHtml(raw).trim();
  const rational = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const v = rational
    ? Number(rational[2]) === 0
      ? NaN
      : Number(rational[1]) / Number(rational[2])
    : Number(s);
  return normalizeHeadingDeg(v);
}

/**
 * Conservative per-file location evidence. EXIF GPS was written by the
 * camera → role "camera". Record-level `coordinates` describe where the
 * archive says the file belongs but the API does not expose whether they
 * are camera or object coordinates → role "unknown". The geosearch center
 * (q.lat/q.lon) is never copied onto candidates. Out-of-city evidence is
 * dropped, never a reason to reject the photo.
 */
function locationFromPage(
  p: CommonsPage,
  info: CommonsImageInfo,
  geo?: SourceGeoContext,
): SeedLocation | undefined {
  try {
    const evidenceUrl = safeEvidenceUrl(info.descriptionurl);
    if (!evidenceUrl) return undefined;

    const meta = info.extmetadata;
    const exifLat = parseGpsCoord(meta?.GPSLatitude?.value, "N", "S");
    const exifLng = parseGpsCoord(meta?.GPSLongitude?.value, "E", "W");
    if (exifLat !== undefined && exifLng !== undefined) {
      const headingDeg = parseGpsHeading(meta?.GPSImgDirection?.value);
      return locationForPoint({ lat: exifLat, lng: exifLng }, geo, {
        role: "camera",
        provenance: "archive",
        evidenceUrl,
        label: "camera position embedded in the archive file",
        ...(headingDeg !== undefined ? { headingDeg } : {}),
      });
    }

    const coord = (p.coordinates ?? [])
      .filter(
        (c): c is { lat: number; lon: number; primary?: string; globe?: string } =>
          typeof c.lat === "number" &&
          Number.isFinite(c.lat) &&
          typeof c.lon === "number" &&
          Number.isFinite(c.lon),
      )
      .sort((a, b) => Number("primary" in b) - Number("primary" in a))[0];
    if (!coord) return undefined;
    return locationForPoint({ lat: coord.lat, lng: coord.lon }, geo, {
      role: "unknown",
      provenance: "archive",
      evidenceUrl,
      label: "coordinates from the archive record",
    });
  } catch {
    return undefined;
  }
}

export function pagesToCandidates(
  pages: Record<string, CommonsPage> | undefined,
  decade: number,
  geo?: SourceGeoContext,
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

    const location = locationFromPage(p, info, geo);

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
      ...(location ? { location } : {}),
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
  u.searchParams.set("prop", "imageinfo|categories|coordinates");
  u.searchParams.set("cllimit", "50");
  // Per-file coordinates: request both camera (primary) and object records.
  u.searchParams.set("colimit", "50");
  u.searchParams.set("coprimary", "all");
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
    const geo: SourceGeoContext = { bbox: q.bbox };
    for (const r of [byText, byGeo]) {
      if (r.status !== "fulfilled") continue;
      for (const c of pagesToCandidates(r.value, q.decade, geo)) {
        if (!seen.has(c.url)) {
          seen.add(c.url);
          out.push(c);
        }
      }
    }
    return out;
  },
};
