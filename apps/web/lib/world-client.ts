import {
  DECADES,
  isModelId,
  safeUrl,
  type ModelId,
  type ModelState,
  type Seed,
  type WorldFailure,
  type WorldPayload,
  type WorldProgress,
  type WorldRequest,
} from "./frontend-types";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_city: "We couldn't identify that city. Try including the country.",
  unsupported_decade: "That decade isn't available yet. Please try another.",
  unsupported_model:
    "This world engine isn't enabled. Remove the model override or contact your teammate.",
  insufficient_archival_photos:
    "We couldn't find a suitable historical photograph for that city and decade.",
  insufficient_photos:
    "We couldn't find a suitable historical photograph for that city and decade.",
  rate_limited: "Too many journeys requested. Please wait a moment before trying again.",
  upstream_failed: "The world service couldn't complete this journey. Please try again.",
  backend_unavailable:
    "The backend is not connected yet. Start it on this app's /api/world route, or try Local preview.",
  invalid_response: "The backend response doesn't match the agreed world contract.",
  mock_backend:
    "The backend returned a mock token. Enable preview mode or configure real Reactor credentials before live testing.",
  connection_failed: "The live world connection ended or failed. Start a new search to reconnect.",
  token_expired:
    "Your world token expired or was rejected. Reconnect to request a fresh token for this engine.",
  image_failed: "The source photograph couldn't be loaded. Try another journey.",
  session_ended: "This journey has ended. Choose a city and decade to begin another.",
  timeout: "The world took too long to start. Cancelled the connection; please try again.",
};

export class WorldError extends Error {
  constructor(
    public readonly code: string,
    public readonly closestDecade?: number,
  ) {
    super(ERROR_MESSAGES[code] ?? "Something went wrong opening this world. Please try again.");
    this.name = "WorldError";
  }
}

export function asFailure(error: unknown): WorldFailure {
  const known = error instanceof WorldError ? error : new WorldError("connection_failed");
  return { code: known.code, message: known.message, closestDecade: known.closestDecade };
}

export function sdkError(error: unknown): WorldError {
  const code = record(error) ? String(error.code ?? error.status ?? "").toUpperCase() : "";
  return new WorldError(
    ["UNAUTHORIZED", "401", "TOKEN_EXPIRED"].includes(code) ? "token_expired" : "connection_failed",
  );
}

export function validateRequest(request: WorldRequest) {
  if (!request.city.trim() || request.city.length > 120) throw new WorldError("invalid_city");
  if (!DECADES.includes(request.decade)) throw new WorldError("unsupported_decade");
  if (request.model !== undefined && !isModelId(request.model))
    throw new WorldError("unsupported_model");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSeed(value: unknown, base: string): Seed {
  if (!record(value) || typeof value.url !== "string") throw new WorldError("invalid_response");
  const url = safeUrl(value.url, base);
  const sourceUrl =
    typeof value.sourceUrl === "string" && value.sourceUrl ? safeUrl(value.sourceUrl) : "";
  if (!url || sourceUrl === undefined) throw new WorldError("invalid_response");
  return {
    url,
    sourceUrl,
    title: typeof value.title === "string" && value.title ? value.title : "Historical photograph",
    author: typeof value.author === "string" && value.author ? value.author : "Author not provided",
    license:
      typeof value.license === "string" && value.license ? value.license : "License not provided",
    licenseUrl: typeof value.licenseUrl === "string" ? safeUrl(value.licenseUrl) : undefined,
    licenseConfidence:
      value.licenseConfidence === "low"
        ? "low"
        : value.licenseConfidence === "high"
          ? "high"
          : undefined,
    thumbUrl: typeof value.thumbUrl === "string" ? safeUrl(value.thumbUrl, base) : undefined,
    year: typeof value.year === "number" ? value.year : undefined,
    restored: value.restored === true,
  };
}

export function parseWorldPayload(value: unknown, base: string): WorldPayload {
  if (
    !record(value) ||
    !record(value.model) ||
    !isModelId(value.model.id) ||
    value.model.reactorModelName !== `reactor/${value.model.id}` ||
    typeof value.sessionToken !== "string" ||
    !value.sessionToken ||
    typeof value.prompt !== "string" ||
    !value.prompt ||
    !record(value.meta) ||
    typeof value.meta.canonicalCity !== "string"
  )
    throw new WorldError("invalid_response");
  if (value.alternates !== undefined && !Array.isArray(value.alternates))
    throw new WorldError("invalid_response");
  return {
    model: { id: value.model.id, reactorModelName: value.model.reactorModelName as string },
    sessionToken: value.sessionToken,
    prompt: value.prompt,
    seed: parseSeed(value.seed, base),
    alternates: Array.isArray(value.alternates)
      ? value.alternates.slice(0, 3).map((seed) => parseSeed(seed, base))
      : [],
    modelState:
      record(value.modelState) && typeof value.modelState.encryptedWorldId === "string"
        ? { encryptedWorldId: value.modelState.encryptedWorldId }
        : undefined,
    enabledModels: Array.isArray(value.enabledModels)
      ? value.enabledModels.filter(isModelId)
      : undefined,
    meta: { canonicalCity: value.meta.canonicalCity },
  };
}

function apiError(value: unknown): WorldError {
  return new WorldError(
    record(value) && typeof value.error === "string" ? value.error : "upstream_failed",
    record(value) && typeof value.closestDecade === "number" ? value.closestDecade : undefined,
  );
}

export async function readWorldResponse(
  response: Response,
  base: string,
  onProgress: (progress: WorldProgress) => void = () => {},
): Promise<WorldPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (!contentType.includes("json"))
      throw new WorldError(response.status === 404 ? "backend_unavailable" : "upstream_failed");
    throw apiError(await response.json());
  }
  if (contentType.includes("application/json"))
    return parseWorldPayload(await response.json(), base);
  if (!contentType.includes("ndjson") || !response.body) throw new WorldError("invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  let payload: WorldPayload | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const value: unknown = JSON.parse(line);
    if (!record(value) || payload) throw new WorldError("invalid_response");
    if (typeof value.error === "string") throw apiError(value);
    if (typeof value.stage === "string") {
      onProgress({
        stage: value.stage.slice(0, 80),
        detail: typeof value.detail === "string" ? value.detail.slice(0, 400) : "",
      });
    } else {
      payload = parseWorldPayload(value, base);
    }
  };
  try {
    while (true) {
      const part = await reader.read();
      total += part.value?.byteLength ?? 0;
      if (total > 1_048_576) throw new WorldError("invalid_response");
      buffer += decoder.decode(part.value, { stream: !part.done });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
      if (buffer.length > 131_072) throw new WorldError("invalid_response");
      if (part.done) {
        consume(buffer);
        break;
      }
    }
    if (!payload) throw new WorldError("invalid_response");
    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) throw new WorldError("invalid_response");
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function requestWorld(
  request: WorldRequest,
  signal: AbortSignal,
  onProgress?: (progress: WorldProgress) => void,
): Promise<WorldPayload> {
  validateRequest(request);
  const response = await fetch("/api/world", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson, application/json",
    },
    body: JSON.stringify(request),
    signal,
    cache: "no-store",
  });
  const payload = await readWorldResponse(response, window.location.origin, onProgress);
  if (request.model && request.model !== payload.model.id)
    throw new WorldError("unsupported_model");
  return payload;
}

export async function refreshToken(model: ModelId, signal: AbortSignal): Promise<string> {
  const response = await fetch("/api/reactor/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new WorldError(response.status === 401 ? "token_expired" : "upstream_failed");
  const value: unknown = await response.json();
  if (!record(value) || typeof value.token !== "string" || !value.token || value.model !== model)
    throw new WorldError("invalid_response");
  return value.token;
}

export async function saveModelState(
  request: WorldRequest,
  model: ModelId,
  state: ModelState,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/world/cache", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, model, state }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new WorldError("upstream_failed");
}
