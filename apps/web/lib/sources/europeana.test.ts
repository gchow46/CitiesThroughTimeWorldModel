import { describe, expect, it } from "vitest";
import { itemsToCandidates } from "./europeana";

const base = {
  title: ["Amsterdam canal"],
  edmIsShownBy: ["https://example.org/img.jpg"],
  year: ["1962"],
  rights: ["http://creativecommons.org/publicdomain/mark/1.0/"],
  guid: "https://www.europeana.eu/item/123/abc",
};

describe("europeana spatial metadata", () => {
  it("propagates simple attributable place coordinates as role unknown", () => {
    const [c] = itemsToCandidates([
      { ...base, edmPlaceLatitude: ["52.37"], edmPlaceLongitude: ["4.90"] },
    ]);
    expect(c.location).toMatchObject({
      point: { lat: 52.37, lng: 4.9 },
      role: "unknown",
      provenance: "archive",
      evidenceUrl: base.guid,
    });
  });

  it("leaves location absent when metadata is missing or unparseable", () => {
    expect(itemsToCandidates([{ ...base }])[0].location).toBeUndefined();
    expect(
      itemsToCandidates([{ ...base, edmPlaceLatitude: ["unknown"] }])[0].location,
    ).toBeUndefined();
    // No attributable record URL → no location.
    const { guid, ...noGuid } = base;
    void guid;
    expect(
      itemsToCandidates([{ ...noGuid, edmPlaceLatitude: ["52.37"], edmPlaceLongitude: ["4.9"] }])[0]
        .location,
    ).toBeUndefined();
  });
});
