import { describe, expect, it } from "vitest";
import { photosToCandidates } from "./flickr";

const base = {
  id: "123",
  server: "65535",
  secret: "abc",
  url_l: "https://live.staticflickr.com/65535/123_abc_b.jpg",
  width_l: 1024,
  height_l: 768,
  title: "Street scene",
  ownername: "archivist",
  license: "4",
  datetaken: "1965-03-01 12:00:00",
};

describe("flickr geo extras", () => {
  it("attaches a conservative unknown-role location", () => {
    const [c] = photosToCandidates([
      { ...base, latitude: "52.3725", longitude: "4.9004", accuracy: "16" },
    ]);
    expect(c.location).toMatchObject({
      point: { lat: 52.3725, lng: 4.9004 },
      role: "unknown",
      provenance: "archive",
      evidenceUrl: "https://www.flickr.com/photos/_/123",
    });
    // The provider's 0–16 accuracy scale must never become meters.
    expect(c.location?.accuracyMeters).toBeUndefined();
  });

  it("treats 0/0 as Flickr's documented no-geo sentinel", () => {
    const [c] = photosToCandidates([{ ...base, latitude: "0", longitude: "0", accuracy: "0" }]);
    expect(c.url).toBe(base.url_l);
    expect(c.location).toBeUndefined();
  });

  it("drops invalid and out-of-city coordinates but keeps the photo", () => {
    const [bad] = photosToCandidates([{ ...base, latitude: "abc", longitude: "4.9" }]);
    expect(bad.location).toBeUndefined();

    const amsterdam = { south: 52.25, west: 4.72, north: 52.45, east: 5.05 };
    const [far] = photosToCandidates([{ ...base, latitude: "51.92", longitude: "4.48" }], {
      bbox: amsterdam,
    });
    expect(far.location).toBeUndefined();

    const [near] = photosToCandidates([{ ...base, latitude: "52.37", longitude: "4.9" }], {
      bbox: amsterdam,
    });
    expect(near.location?.point).toEqual({ lat: 52.37, lng: 4.9 });
  });

  it("works when geo extras are absent", () => {
    const [c] = photosToCandidates([{ ...base }]);
    expect(c.location).toBeUndefined();
  });
});
