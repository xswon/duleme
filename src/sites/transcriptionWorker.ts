import {
  buildAliyunTranscriptionBody,
  extractAliyunTaskId,
  mapTranscriptionProviderError,
  parseAliyunTaskState,
  parseAliyunTranscriptSegments,
  transcriptionErrorMessage,
  type TranscriptionErrorCode,
} from "../services/transcriptionCore";
import {
  fetchWithValidatedRedirects,
  publicHttpUrl,
  SitesOutboundError,
  type SitesFetchLike,
} from "./outboundNetwork";

const ALIYUN_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const TRANSCRIPTION_TIMEOUT_MS = 30_000;
const TRANSCRIPTION_REQUEST_MAX_BYTES = 64 * 1024;
const TRANSCRIPTION_API_MAX_BYTES = 1024 * 1024;
const TRANSCRIPT_RESULT_MAX_BYTES = 15 * 1024 * 1024;
const TRANSCRIPTION_MAX_REDIRECTS = 2;
const TASK_ID = /^[A-Za-z0-9_-]{1,200}$/;

export interface SitesTranscriptionRuntimeOptions {
  fetchImpl?: SitesFetchLike;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxApiBytes?: number;
  maxResultBytes?: number;
  maxRedirects?: number;
}

class SitesTranscriptionError extends Error {
  constructor(
    readonly code: TranscriptionErrorCode,
    message = transcriptionErrorMessage(code),
    readonly status = 502,
  ) {
    super(message);
    this.name = "SitesTranscriptionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(error: unknown): Response {
  const known = error instanceof SitesTranscriptionError
    ? error
    : new SitesTranscriptionError("unknown");
  return Response.json(
    { code: known.code, message: transcriptionErrorMessage(known.code) },
    {
      status: known.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function readTextLimited(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maxBytes: number,
  tooLarge: SitesTranscriptionError,
): Promise<string> {
  const length = Number(declaredLength);
  if (declaredLength && Number.isFinite(length) && length > maxBytes) throw tooLarge;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("response too large");
        throw tooLarge;
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function readJsonRequest(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const text = await readTextLimited(
    request.body,
    request.headers.get("Content-Length"),
    maxBytes,
    new SitesTranscriptionError("unknown", "转录请求体过大。", 413),
  );
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new SitesTranscriptionError("unknown", "转录请求必须是 JSON 对象。", 400);
  }
}

async function readJsonResponse(response: Response, maxBytes: number): Promise<unknown> {
  const text = await readTextLimited(
    response.body,
    response.headers.get("Content-Length"),
    maxBytes,
    new SitesTranscriptionError("provider_unavailable"),
  );
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new SitesTranscriptionError("provider_unavailable");
  }
}

function requireApiKey(value: unknown): string {
  const apiKey = typeof value === "string" ? value.trim() : "";
  if (!apiKey) {
    throw new SitesTranscriptionError("invalid_credentials", "请先填写 API Key。", 400);
  }
  if (apiKey.length > 16_384) {
    throw new SitesTranscriptionError("invalid_credentials", undefined, 400);
  }
  return apiKey;
}

function publicAudioUrl(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new SitesTranscriptionError("audio_unreachable", undefined, 400);
  }
  try {
    return publicHttpUrl(
      value,
      "Audio",
      "transcription_invalid_audio_url",
      "transcription_unsafe_audio_url",
    ).toString();
  } catch {
    throw new SitesTranscriptionError(
      "audio_unreachable",
      "音频地址不可访问或指向私有网络。",
      400,
    );
  }
}

function validateAliyunApiUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const base = new URL(ALIYUN_BASE_URL);
  if (url.protocol !== "https:" || url.origin !== base.origin || !url.pathname.startsWith("/api/v1/")) {
    throw new SitesTranscriptionError("provider_unavailable");
  }
  return url;
}

function asProviderError(status: number, payload: unknown): SitesTranscriptionError {
  const mapped = mapTranscriptionProviderError(status, payload);
  return new SitesTranscriptionError(mapped.code, undefined, mapped.status);
}

async function fetchAliyunJson(
  url: URL,
  apiKey: string,
  init: RequestInit,
  options: SitesTranscriptionRuntimeOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? (
    (input: RequestInfo | URL, requestInit?: RequestInit) => globalThis.fetch(input, requestInit)
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS,
  );
  try {
    const { response } = await fetchWithValidatedRedirects(url, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: options.maxRedirects ?? TRANSCRIPTION_MAX_REDIRECTS,
      requestInit: {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.headers || {}),
        },
      },
      validateUrl: validateAliyunApiUrl,
      tooManyRedirectsCode: "transcription_too_many_redirects",
      invalidRedirectCode: "transcription_invalid_redirect",
      label: "Transcription provider",
    });

    const payload = await readJsonResponse(
      response,
      options.maxApiBytes ?? TRANSCRIPTION_API_MAX_BYTES,
    );
    if (!response.ok) throw asProviderError(response.status, payload);
    return payload;
  } catch (error) {
    if (error instanceof SitesTranscriptionError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SitesTranscriptionError("timeout", undefined, 504);
    }
    if (error instanceof SitesOutboundError) {
      throw new SitesTranscriptionError("provider_unavailable");
    }
    throw new SitesTranscriptionError("provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTranscriptResult(
  rawUrl: string,
  options: SitesTranscriptionRuntimeOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? (
    (input: RequestInfo | URL, requestInit?: RequestInit) => globalThis.fetch(input, requestInit)
  );
  let initialUrl: URL;
  try {
    initialUrl = publicHttpUrl(
      rawUrl,
      "Transcript result",
      "transcription_invalid_result_url",
      "transcription_unsafe_result_url",
    );
  } catch {
    throw new SitesTranscriptionError("provider_unavailable");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS,
  );
  try {
    const { response } = await fetchWithValidatedRedirects(initialUrl, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: options.maxRedirects ?? TRANSCRIPTION_MAX_REDIRECTS,
      requestInit: {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      validateUrl: (value) => publicHttpUrl(
        value,
        "Transcript result",
        "transcription_invalid_result_url",
        "transcription_unsafe_result_url",
      ),
      tooManyRedirectsCode: "transcription_too_many_result_redirects",
      invalidRedirectCode: "transcription_invalid_result_redirect",
      label: "Transcript result",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SitesTranscriptionError("provider_unavailable");
    }
    return await readJsonResponse(
      response,
      options.maxResultBytes ?? TRANSCRIPT_RESULT_MAX_BYTES,
    );
  } catch (error) {
    if (error instanceof SitesTranscriptionError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SitesTranscriptionError("timeout", undefined, 504);
    }
    throw new SitesTranscriptionError("provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function testConnection(
  apiKey: string,
  options: SitesTranscriptionRuntimeOptions,
): Promise<void> {
  try {
    await fetchAliyunJson(
      new URL(`${ALIYUN_BASE_URL}/tasks/__wreader_connection_test__`),
      apiKey,
      { method: "GET", headers: { Accept: "application/json" } },
      options,
    );
  } catch (error) {
    if (
      error instanceof SitesTranscriptionError
      && error.code === "unknown"
      && error.status === 404
    ) {
      return;
    }
    throw error;
  }
}

async function submitTask(
  body: Record<string, unknown>,
  options: SitesTranscriptionRuntimeOptions,
) {
  const apiKey = requireApiKey(body.apiKey);
  const audioUrl = publicAudioUrl(body.audioUrl);
  const language = typeof body.language === "string" ? body.language.trim() : undefined;
  const diarization = typeof body.diarization === "boolean" ? body.diarization : undefined;
  const context = typeof body.context === "string" ? body.context : undefined;

  const payload = await fetchAliyunJson(
    new URL(`${ALIYUN_BASE_URL}/services/audio/asr/transcription`),
    apiKey,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(buildAliyunTranscriptionBody({
        audioUrl,
        language,
        diarization,
        context,
      })),
    },
    options,
  );
  const taskId = extractAliyunTaskId(payload);
  if (!taskId) throw new SitesTranscriptionError("unknown");
  return taskId;
}

async function pollTask(
  taskId: string,
  body: Record<string, unknown>,
  options: SitesTranscriptionRuntimeOptions,
): Promise<Record<string, unknown>> {
  if (!TASK_ID.test(taskId)) {
    throw new SitesTranscriptionError("unknown", "无效的转录任务 ID。", 400);
  }
  const apiKey = requireApiKey(body.apiKey);
  const payload = await fetchAliyunJson(
    new URL(`${ALIYUN_BASE_URL}/tasks/${encodeURIComponent(taskId)}`),
    apiKey,
    { method: "GET", headers: { Accept: "application/json" } },
    options,
  );
  const state = parseAliyunTaskState(payload);
  if (state.status === "processing") return { status: "processing" };
  if (state.status === "failed") {
    return {
      status: "failed",
      code: state.error.code,
      message: transcriptionErrorMessage(state.error.code),
    };
  }

  const rawTranscript = await fetchTranscriptResult(state.transcriptionUrl, options);
  return {
    status: "completed",
    segments: parseAliyunTranscriptSegments(rawTranscript),
  };
}

export async function handleSitesTranscriptionRequest(
  request: Request,
  options: SitesTranscriptionRuntimeOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json(
      { code: "unknown", message: "转录接口只支持 POST。" },
      {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      },
    );
  }

  const url = new URL(request.url);
  try {
    const body = await readJsonRequest(
      request,
      options.maxRequestBytes ?? TRANSCRIPTION_REQUEST_MAX_BYTES,
    );

    if (url.pathname === "/api/transcription/settings/test") {
      await testConnection(requireApiKey(body.apiKey), options);
      return Response.json({ ok: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/api/transcription/tasks") {
      const taskId = await submitTask(body, options);
      return Response.json(
        { taskId, status: "processing" },
        {
          status: 202,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const pollMatch = /^\/api\/transcription\/tasks\/([^/]+)\/poll$/.exec(url.pathname);
    if (pollMatch) {
      return Response.json(
        await pollTask(decodeURIComponent(pollMatch[1]), body, options),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { code: "sites_route_not_found", message: "Not found" },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
