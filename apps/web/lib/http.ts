const DEFAULT_UA = "CitiesThroughTime/0.1 (https://github.com/gchow46/CitiesThroughTimeWorldModel)";

export async function fetchJson<T>(
  url: string,
  { timeoutMs = 6000, headers = {} }: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": DEFAULT_UA, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}
