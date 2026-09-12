import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms — Cities Through Time",
  description: "Terms of use for Cities Through Time, including Google Maps content rules.",
};

const main: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "48px 24px 96px",
  lineHeight: 1.7,
};

const h1: React.CSSProperties = { fontFamily: "var(--serif)", fontSize: 40, fontWeight: 400 };
const h2: React.CSSProperties = {
  fontFamily: "var(--serif)",
  fontSize: 24,
  fontWeight: 400,
  marginTop: 40,
};
const muted: React.CSSProperties = { color: "var(--muted)" };

export default function TermsPage() {
  return (
    <main style={main}>
      <h1 style={h1}>Terms of use</h1>
      <p style={muted}>Last updated: September 2026 · Draft for owner review — not legal advice.</p>

      <h2 style={h2}>The service</h2>
      <p>
        Cities Through Time is a demonstration that pairs openly licensed archival photography with
        an AI-generated, explorable interpretation of a historic street scene. Generated worlds are
        artistic interpretations — they are not documentary evidence and may contain inaccuracies.
      </p>

      <h2 style={h2}>Archival photographs</h2>
      <p>
        Historical seeds come from open archives and carry the license shown next to each image.
        Respect those licenses if you reuse them; the attribution displayed in the app is part of
        the record.
      </p>

      <h2 style={h2}>Google Maps and Street View content</h2>
      <p>
        The present-day comparison pane displays Google Maps and Street View through the Google Maps
        JavaScript API. Your use of that pane is also governed by the{" "}
        <a href="https://cloud.google.com/maps-platform/terms" rel="noreferrer">
          Google Maps Platform Terms of Service
        </a>
        , the{" "}
        <a href="https://maps.google.com/help/terms_maps/" rel="noreferrer">
          Google Maps/Google Earth Additional Terms of Service
        </a>
        , and{" "}
        <a href="https://policies.google.com/privacy" rel="noreferrer">
          Google&rsquo;s Privacy Policy
        </a>
        , all of which are incorporated here by reference. In particular:
      </p>
      <ul>
        <li>Do not screenshot, scrape, extract, or re-host Google Maps or Street View content.</li>
        <li>
          Do not use Google content to create or improve datasets, AI/ML models, or competing
          mapping services.
        </li>
        <li>
          Street View imagery is recorded photography, not a live view; capture dates are shown when
          Google provides them and imagery may be several years old.
        </li>
      </ul>

      <h2 style={h2}>Acceptable use</h2>
      <ul>
        <li>Do not abuse the API endpoints or circumvent rate limits.</li>
        <li>Do not misrepresent generated imagery as authentic historical footage.</li>
        <li>Do not remove or obscure archive or Google attribution.</li>
      </ul>

      <h2 style={h2}>No warranty</h2>
      <p style={muted}>
        Provided as-is for demonstration purposes. These terms are a working draft and do not
        constitute legal advice. <Link href="/">Back to search</Link> ·{" "}
        <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}
