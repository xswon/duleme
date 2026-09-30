import {
  AiSummaryInputError,
  summarizeWithCompletion,
  type AiChatMessage,
  type SummarySource,
} from "../services/aiSummaryCore";
import {
  fetchWithValidatedRedirects,
  publicHttpUrl,
  SitesOutboundError,
  type SitesFetchLike,
} from "./outboundNetwork";

const AI_BODY_MAX_BYTES = 5 * 1024 * 1024;
const AI_RESPONSE_MAX_BYTES = 5 * 1024 * 1024;
const AI_MAX_REDIRECTS = 2;

type AiErrorCode =
  | "not_configured"
  | "invalid_config"
  | "unauthorized"
  | "endpoint_not_found"
  | "model_not_found"
  | "rate_limited"
  | "timeout"
  | "connection_refused"
  | "invalid_request"
  | "upstream_error"
  | "invalid_response";

interface AiRequestConfig {
  baseURL: string;
  apiKey?: string;
  model: string;
}

interface AiModelOption {
  id: string;
  name?: string;
  created?: number;
  ownedBy?: string;
}

export interface SitesAiRuntimeOptions {
  fetchImpl?: SitesFetchLike;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
}

class SitesAiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SitesAiError";
  }
}

function statusForAiError(error: SitesAiError): number {
  if (error.status && error.status >= 400 && error.status < 600) return error.status;
  if (error.code === "not_configured" || error.code === "invalid_config" || error.code === "invalid_request") return 400;
  if (error.code === "timeout") return 504;
  if (error.code === "connection_refused") return 502;
  return 502;
}

function aiErrorPayload(error: unknown) {
  if (error instanceof SitesAiError) {
    return {
      error: error.message,
      code: error.code,
      ...(error.status ? { upstreamStatus: error.status } : {}),
    };
  }
  return { error: "AI request failed.", code: "upstream_error" };
}

function aiErrorResponse(error: unknown): Response {
  const normalized = error instanceof SitesAiError
    ? error
    : new SitesAiError("upstream_error", "AI request failed.");
  return Response.json(aiErrorPayload(normalized), {
    status: statusForAiError(normalized),
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePublicAiBaseUrl(rawValue: unknown): URL {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) throw new SitesAiError("not_configured", "AI service is not configured.");

  let parsed: URL;
  try {
    parsed = publicHttpUrl(value, "AI endpoint", "ai_invalid_url", "ai_unsafe_url");
  } catch {
    throw new SitesAiError("invalid_config", "Base URL must be a public HTTPS endpoint.");
  }

  if (parsed.protocol !== "https:") {
    throw new SitesAiError("invalid_config", "ChatGPT Sites AI endpoints must use HTTPS.");
  }
  if (parsed.search || parsed.hash) {
    throw new SitesAiError("invalid_config", "Base URL cannot include a query string or URL fragment.");
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed;
}

function normalizeEndpointConfig(input: unknown): Pick<AiRequestConfig, "baseURL" | "apiKey"> {
  const value = isRecord(input) ? input : {};
  const parsed = normalizePublicAiBaseUrl(value.baseURL);
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  if (!apiKey) {
    throw new SitesAiError("not_configured", "API Key is required for ChatGPT Sites AI endpoints.");
  }
  if (apiKey.length > 16_384) {
    throw new SitesAiError("invalid_config", "API Key is too long.");
  }
  return {
    baseURL: parsed.toString().replace(/\/$/, ""),
    apiKey,
  };
}

function normalizeConfig(input: unknown): AiRequestConfig {
  const endpoint = normalizeEndpointConfig(input);
  const value = isRecord(input) ? input : {};
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!model) throw new SitesAiError("not_configured", "AI model is not configured.");
  if (model.length > 512) throw new SitesAiError("invalid_config", "AI model identifier is too long.");
  return { ...endpoint, model };
}

function endpointFor(baseURL: string, suffix: string): URL {
  return new URL(`${baseURL.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`);
}

function extractUpstreamMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.error === "string") return payload.error;
  if (isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  return typeof payload.message === "string" ? payload.message : "";
}

function classifyHttpError(status: number, upstreamMessage: string): SitesAiError {
  const lower = upstreamMessage.toLowerCase();
  if (status === 401 || status === 403) {
    return new SitesAiError("unauthorized", "API Key is invalid or lacks permission.", status);
  }
  if (status === 404) {
    const code: AiErrorCode = /model|deployment/.test(lower) ? "model_not_found" : "endpoint_not_found";
    return new SitesAiError(
      code,
      code === "model_not_found"
        ? "The configured model was not found."
        : "The AI endpoint was not found.",
      status,
    );
  }
  if (status === 429) {
    return new SitesAiError("rate_limited", "The AI service rate limit or quota was reached.", status);
  }
  if (status === 400 || status === 422) {
    return new SitesAiError("invalid_request", "The AI service rejected the request.", status);
  }
  return new SitesAiError("upstream_error", "The AI service is temporarily unavailable.", status);
}

function extractAssistantText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new SitesAiError("invalid_response", "AI service returned an invalid response.");
  }
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new SitesAiError("invalid_response", "AI service returned no completion choices.");
  }
  const first = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(first.message) ? first.message : {};
  const content = message.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.map((part) => (
      isRecord(part) && typeof part.text === "string" ? part.text : ""
    )).join("").trim();
    if (text) return text;
  }
  throw new SitesAiError("invalid_response", "AI service returned an empty completion.");
}

function extractModelOptions(payload: unknown): AiModelOption[] {
  let rawModels: unknown[] = [];
  if (Array.isArray(payload)) {
    rawModels = payload;
  } else if (isRecord(payload)) {
    if (Array.isArray(payload.data)) rawModels = payload.data;
    else if (Array.isArray(payload.models)) rawModels = payload.models;
  }

  const seen = new Set<string>();
  const models: AiModelOption[] = [];
  for (const raw of rawModels) {
    if (typeof raw === "string") {
      const id = raw.trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        models.push({ id });
      }
      continue;
    }
    if (!isRecord(raw)) continue;
    const idValue = typeof raw.id === "string" ? raw.id : typeof raw.model === "string" ? raw.model : "";
    const id = idValue.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined;
    const created = typeof raw.created === "number" && Number.isFinite(raw.created) ? raw.created : undefined;
    const ownedBy = typeof raw.owned_by === "string" && raw.owned_by.trim() ? raw.owned_by.trim() : undefined;
    models.push({
      id,
      ...(name ? { name } : {}),
      ...(created !== undefined ? { created } : {}),
      ...(ownedBy ? { ownedBy } : {}),
    });
  }
  return models;
}

async function readTextLimited(
  stream: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maxBytes: number,
  tooLargeError: SitesAiError,
): Promise<string> {
  const length = Number(declaredLength);
  if (declaredLength && Number.isFinite(length) && length > maxBytes) {
    throw tooLargeError;
  }
  if (!stream) return "";

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("AI response is too large");
        throw tooLargeError;
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function readJsonResponse(response: Response, maxBytes: number): Promise<unknown> {
  const text = await readTextLimited(
    response.body,
    response.headers.get("Content-Length"),
    maxBytes,
    new SitesAiError("invalid_response", "AI service response is too large."),
  );
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new SitesAiError("invalid_response", "AI service returned invalid JSON.");
  }
}

async function readRequestJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (request.headers.has("Content-Length") && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new SitesAiError("invalid_request", "AI request body is too large.");
  }
  const text = await readTextLimited(
    request.body,
    request.headers.get("Content-Length"),
    maxBytes,
    new SitesAiError("invalid_request", "AI request body is too large."),
  );
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new SitesAiError("invalid_request", "AI request body must be a JSON object.");
  }
}

function validateRedirectForOrigin(baseOrigin: string, rawUrl: string): URL {
  let url: URL;
  try {
    url = publicHttpUrl(rawUrl, "AI endpoint", "ai_invalid_redirect", "ai_unsafe_redirect");
  } catch {
    throw new SitesAiError("invalid_config", "AI endpoint redirected to an unsafe URL.");
  }
  if (url.protocol !== "https:" || url.origin !== baseOrigin) {
    throw new SitesAiError("invalid_config", "AI endpoint redirected to a different origin.");
  }
  return url;
}

async function fetchAiJson(
  config: Pick<AiRequestConfig, "baseURL" | "apiKey">,
  endpoint: URL,
  init: RequestInit,
  timeoutMs: number,
  options: SitesAiRuntimeOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, requestInit?: RequestInit) => globalThis.fetch(input, requestInit));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { response } = await fetchWithValidatedRedirects(endpoint, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: options.maxRedirects ?? AI_MAX_REDIRECTS,
      requestInit: init,
      validateUrl: (url) => validateRedirectForOrigin(endpoint.origin, url),
      tooManyRedirectsCode: "ai_too_many_redirects",
      invalidRedirectCode: "ai_invalid_redirect",
      label: "AI endpoint",
    });
    const payload = await readJsonResponse(response, options.maxResponseBytes ?? AI_RESPONSE_MAX_BYTES);
    if (!response.ok) throw classifyHttpError(response.status, extractUpstreamMessage(payload));
    return payload;
  } catch (error) {
    if (error instanceof SitesAiError) throw error;
    if (error instanceof SitesOutboundError) {
      throw new SitesAiError("invalid_config", "AI endpoint redirected to an unsafe URL.");
    }
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SitesAiError("timeout", "AI service request timed out.");
    }
    throw new SitesAiError("upstream_error", "Could not reach the AI service.");
  } finally {
    clearTimeout(timeout);
  }
}

async function listAiModels(input: unknown, options: SitesAiRuntimeOptions): Promise<AiModelOption[]> {
  const config = normalizeEndpointConfig(input);
  const payload = await fetchAiJson(
    config,
    endpointFor(config.baseURL, "models"),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    15_000,
    options,
  );
  return extractModelOptions(payload);
}

async function createChatCompletion(
  input: unknown,
  messages: AiChatMessage[],
  options: SitesAiRuntimeOptions,
  timeoutMs = 30_000,
): Promise<string> {
  const config = normalizeConfig(input);
  const payload = await fetchAiJson(
    config,
    endpointFor(config.baseURL, "chat/completions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages }),
    },
    timeoutMs,
    options,
  );
  return extractAssistantText(payload);
}

async function testAiConnection(input: unknown, options: SitesAiRuntimeOptions): Promise<void> {
  await createChatCompletion(
    input,
    [
      { role: "system", content: "You are a connectivity check." },
      { role: "user", content: "Reply only with OK." },
    ],
    options,
    15_000,
  );
}

function summaryInput(body: Record<string, unknown>) {
  return {
    title: typeof body.title === "string" ? body.title : "",
    content: typeof body.content === "string" ? body.content : "",
    snippet: typeof body.snippet === "string" ? body.snippet : "",
    source: body.source === "transcript" ? "transcript" as SummarySource : "article" as SummarySource,
    config: body.config,
  };
}

async function summarize(
  body: Record<string, unknown>,
  options: SitesAiRuntimeOptions,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const input = summaryInput(body);
  if (!input.title && !input.content && !input.snippet) {
    throw new SitesAiError("invalid_request", "Missing article title or content");
  }
  try {
    return await summarizeWithCompletion(
      (messages, timeoutMs) => createChatCompletion(input.config, messages, options, timeoutMs),
      input.title,
      input.content,
      input.snippet,
      input.source,
      onProgress,
    );
  } catch (error) {
    if (error instanceof AiSummaryInputError) {
      throw new SitesAiError("invalid_request", error.message);
    }
    throw error;
  }
}

function streamSummary(body: Record<string, unknown>, options: SitesAiRuntimeOptions): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      void summarize(body, options, (progress) => send({ type: "progress", progress }))
        .then((summary) => send({ type: "result", summary }))
        .catch((error) => send({ type: "error", ...aiErrorPayload(error) }))
        .finally(() => controller.close());
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleSitesAiRequest(
  request: Request,
  options: SitesAiRuntimeOptions = {},
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/ai/status") {
    if (request.method !== "GET") {
      return Response.json({ code: "invalid_request", error: "AI status only supports GET" }, {
        status: 405,
        headers: { Allow: "GET", "Cache-Control": "no-store" },
      });
    }
    return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  if (request.method !== "POST") {
    return Response.json({ code: "invalid_request", error: "AI endpoint only supports POST" }, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }

  try {
    const body = await readRequestJson(request, options.maxRequestBytes ?? AI_BODY_MAX_BYTES);
    if (url.pathname === "/api/ai/models") {
      return Response.json({ models: await listAiModels(body.config, options) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (url.pathname === "/api/ai/test") {
      const config = body.config ?? body;
      const startedAt = Date.now();
      await testAiConnection(config, options);
      return Response.json({ ok: true, latencyMs: Date.now() - startedAt }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (url.pathname === "/api/ai/summarize") {
      if (url.searchParams.get("stream") === "1") return streamSummary(body, options);
      return Response.json({ summary: await summarize(body, options) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ code: "sites_route_not_found", error: "Not found" }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
