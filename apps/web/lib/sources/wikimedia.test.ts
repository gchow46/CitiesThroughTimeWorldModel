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
