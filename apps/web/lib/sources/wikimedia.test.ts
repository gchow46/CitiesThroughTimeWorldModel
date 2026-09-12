import { describe, expect, it } from "vitest";
import { pagesToCandidates } from "./wikimedia";
import fixture from "../__fixtures__/commons-amsterdam-1960.json";

const pages = fixture.query.pages;

describe("wikimedia pagesToCandidates", () => {
  const out = pagesToCandidates(pages, 1960);

  it("keeps licensed, in-decade, landscape photos", () => {
    const urls = out.map((c) => c.url);
    expect(urls).toContain("https://upload.wikimedia.org/wikipedia/commons/a/a1/Damrak_1967.jpg");
    expect(urls).toContain(
      "https://upload.wikimedia.org/wikipedia/commons/g/g7/Herengracht_1963.jpg",
    );
    expect(urls).toContain("https://upload.wikimedia.org/wikipedia/commons/b/b2/Map_canals.png");
  });

  it("rejects portrait orientation (not croppable to 16:9)", () => {
    expect(out.map((c) => c.url)).not.toContain(
      "https://upload.wikimedia.org/wikipedia/commons/c/c3/Portrait_1968.jpg",
    );
  });

  it("rejects non-commercial licenses", () => {
    expect(out.map((c) => c.url)).not.toContain(
      "https://upload.wikimedia.org/wikipedia/commons/d/d4/Nc.jpg",
    );
  });

  it("rejects images under 800px wide", () => {
    expect(out.map((c) => c.url)).not.toContain(
      "https://upload.wikimedia.org/wikipedia/commons/e/e5/Tiny.jpg",
    );
  });

  it("rejects photos outside decade ±2", () => {
    expect(out.map((c) => c.url)).not.toContain(
      "https://upload.wikimedia.org/wikipedia/commons/f/f6/Wrong.jpg",
    );
  });

  it("extracts year, license, author from extmetadata", () => {
    const damrak = out.find((c) => c.url.includes("Damrak"))!;
    expect(damrak.year).toBe(1967);
    expect(damrak.license).toBe("CC BY-SA 3.0");
    expect(damrak.author).toBe("J. de Vries");
    expect(damrak.licenseConfidence).toBe("high");
  });
});

describe("wikimedia location evidence", () => {
  const baseInfo = {
    url: "https://upload.wikimedia.org/wikipedia/commons/x/x1/Photo.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
    width: 2000,
    height: 1200,
    extmetadata: {
      DateTimeOriginal: { value: "1965" },
      LicenseShortName: { value: "CC BY-SA 3.0" },
    },
  };
  const basePage = { title: "File:Photo.jpg", imageinfo: [baseInfo] };

  it("prefers EXIF GPS as camera role with evidence URL", () => {
    const pages = {
      a: {
        ...basePage,
        imageinfo: [
          {
            ...baseInfo,
            extmetadata: {
              ...baseInfo.extmetadata,
              GPSLatitude: { value: "52.372592" },
              GPSLongitude: { value: "4.90046" },
              GPSImgDirection: { value: "90" },
            },
          },
        ],
      },
    };
    const [c] = pagesToCandidates(pages, 1960);
    expect(c.location).toMatchObject({
      point: { lat: 52.372592, lng: 4.90046 },
      role: "camera",
      provenance: "archive",
      evidenceUrl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
      headingDeg: 90,
    });
  });

  it("parses DMS GPS values with hemisphere letters", () => {
    const pages = {
      a: {
        ...basePage,
        imageinfo: [
          {
            ...baseInfo,
            extmetadata: {
              ...baseInfo.extmetadata,
              GPSLatitude: { value: "51° 30′ 56.2″ N" },
              GPSLongitude: { value: "0° 7′ 44″ W" },
            },
          },
        ],
      },
    };
    const [c] = pagesToCandidates(pages, 1960);
    expect(c.location?.role).toBe("camera");
    expect(c.location?.point.lat).toBeCloseTo(51.5156, 3);
    expect(c.location?.point.lng).toBeCloseTo(-0.1289, 3);
  });

  it("attaches record coordinates as role unknown, preferring primary", () => {
    const pages = {
      a: {
        ...basePage,
        coordinates: [
          { lat: 52.0, lon: 4.5, globe: "earth" },
          { lat: 52.372592, lon: 4.90046, primary: "", globe: "earth" },
        ],
      },
    };
    const [c] = pagesToCandidates(pages, 1960);
    expect(c.location).toMatchObject({
      point: { lat: 52.372592, lng: 4.90046 },
      role: "unknown",
      provenance: "archive",
    });
    expect(c.location?.headingDeg).toBeUndefined();
  });

  it("keeps the candidate when geo metadata is malformed", () => {
    const pages = {
      a: {
        ...basePage,
        coordinates: [{ lat: "north", lon: null }],
        imageinfo: [
          {
            ...baseInfo,
            extmetadata: {
              ...baseInfo.extmetadata,
              GPSLatitude: { value: "not a coordinate" },
            },
          },
        ],
      },
    };
    const [c] = pagesToCandidates(pages as never, 1960);
    expect(c.url).toBe(baseInfo.url);
    expect(c.location).toBeUndefined();
  });

  it("rejects out-of-range and out-of-city coordinates", () => {
    const amsterdam = { south: 52.25, west: 4.72, north: 52.45, east: 5.05 };
    const outOfRange = {
      a: { ...basePage, coordinates: [{ lat: 95, lon: 4.9, primary: "" }] },
    };
    expect(pagesToCandidates(outOfRange, 1960)[0].location).toBeUndefined();
    const outOfCity = {
      a: { ...basePage, coordinates: [{ lat: 51.92, lon: 4.48, primary: "" }] }, // Rotterdam
    };
    expect(pagesToCandidates(outOfCity, 1960, { bbox: amsterdam })[0].location).toBeUndefined();
    // The same point passes when no city context is given.
    expect(pagesToCandidates(outOfCity, 1960)[0].location?.point.lat).toBeCloseTo(51.92);
  });

  it("never copies the query center onto candidates", () => {
    const [c] = pagesToCandidates({ a: basePage }, 1960);
    expect(c.location).toBeUndefined();
  });
});
