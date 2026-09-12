export default function Home() {
  // A1 replaces this with the real city + decade form.
  return (
    <main style={{ padding: "4rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Cities Through Time</h1>
      <p>
        Scaffold is up. The landing form lands in A1 — until then, hit the mock:{" "}
        <code>
          curl -X POST localhost:3000/api/world -H &apos;content-type: application/json&apos; -d
          &apos;{`{"city":"Amsterdam","decade":1960}`}&apos;
        </code>
      </p>
      <p>
        Set <code>MOCK_WORLD=1</code> in <code>apps/web/.env.local</code> to enable mock payloads.
      </p>
    </main>
  );
}
