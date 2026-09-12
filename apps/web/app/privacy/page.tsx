import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Cities Through Time",
  description: "How Cities Through Time handles data, including the Google Street View comparison.",
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

export default function PrivacyPage() {
  return (
    <main style={main}>
      <h1 style={h1}>Privacy</h1>
      <p style={muted}>Last updated: September 2026 · Draft for owner review — not legal advice.</p>

      <h2 style={h2}>What this service does</h2>
      <p>
        Cities Through Time finds openly licensed archival photographs of a city and decade you
        choose, then generates an explorable world from them. We ask for a city and a decade — we do
        not require an account.
      </p>

      <h2 style={h2}>What we store</h2>
      <ul>
        <li>
          <strong>Seed photographs</strong> from open archives (Wikimedia Commons, Europeana, Flickr
          Commons), re-encoded and cached in our blob storage with their credits and licenses.
        </li>
        <li>
          <strong>Derived world data</strong> (normalized seeds, prompts, per-model session state)
          cached in Redis for up to 30 days to keep the service fast.
        </li>
        <li>
          <strong>Request metadata</strong> used for rate limiting and abuse prevention (IP-derived
          limits on <code>/api/world</code>).
        </li>
      </ul>

      <h2 style={h2}>The Then &amp; Now comparison and Google</h2>
      <p>
        When the Then &amp; Now comparison is enabled, the present-day pane loads the Google Maps
        JavaScript API directly in your browser. That means Google receives your IP address and
        processes your interactions with the map and Street View under{" "}
        <a href="https://policies.google.com/privacy" rel="noreferrer">
          Google&rsquo;s Privacy Policy
        </a>{" "}
        and the{" "}
        <a href="https://maps.google.com/help/terms_maps/" rel="noreferrer">
          Google Maps/Google Earth Additional Terms of Service
        </a>
        .
      </p>
      <ul>
        <li>Google content loads only in the browser after an enabled world journey starts.</li>
        <li>
          We do not send Google a Reactor session token, your search history, or any account data.
        </li>
        <li>
          If you pick a point on the map yourself, it is used only for that viewing session — it is
          not stored by us and is not added to our location dataset.
        </li>
        <li>
          We do not set a device-geolocation permission; the map never uses your device&rsquo;s GPS.
        </li>
        <li>
          Google Street View imagery, panorama metadata, and map tiles are never stored in our
          caches or fed into the world model.
        </li>
      </ul>

      <h2 style={h2}>Archive and open data attribution</h2>
      <p>
        Photo credits and licenses are shown next to each historical seed. City context comes from
        OpenStreetMap&rsquo;s Nominatim service (© OpenStreetMap contributors, ODbL). Curated photo
        locations are reviewed open-data records listed with an evidence link; none are derived from
        Google content.
      </p>

      <h2 style={h2}>Questions</h2>
      <p style={muted}>
        This page is informational and will be replaced by the operator&rsquo;s reviewed policy
        before launch. <Link href="/">Back to search</Link> · <Link href="/terms">Terms</Link>
      </p>
    </main>
  );
}
