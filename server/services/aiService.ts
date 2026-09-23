import { fetchLoopbackHttp, fetchPublicHttp } from "./outboundNetwork";

export interface AiRequestConfig {
  baseURL: string;
  apiKey?: string;
  model: string;
}

export interface AiModelOption {
  id: string;
  name?: string;
  created?: number;
  ownedBy?: string;
}

export type AiErrorCode =
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

export class AiServiceError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function fetchAiEndpoint(config: Pick<AiRequestConfig, "baseURL">, endpoint: string, init: RequestInit): Promise<Response> {
  const hostname = new URL(config.baseURL).hostname;
  return isLoopbackHost(hostname)
    ? fetchLoopbackHttp(endpoint, init)
    : fetchPublicHttp(endpoint, init);
}

function normalizeEndpointConfig(input?: Partial<AiRequestConfig>): Pick<AiRequestConfig, "baseURL" | "apiKey"> {
  const hasExplicitConfig = input !== undefined;
  const baseURL = (hasExplicitConfig ? input.baseURL || "" : process.env.AI_BASE_URL || "").trim();
  const apiKey = (hasExplicitConfig ? input.apiKey || "" : process.env.AI_API_KEY || "").trim();

  if (!baseURL) {
    throw new AiServiceError("not_configured", "AI service is not configured.");
  }

  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new AiServiceError("invalid_config", "Base URL is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AiServiceError("invalid_config", "Base URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new AiServiceError("invalid_config", "Base URL cannot include credentials or a URL fragment.");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new AiServiceError("invalid_config", "Non-local AI endpoints must use HTTPS.");
  }
  if (!apiKey && !isLoopbackHost(parsed.hostname)) {
    throw new AiServiceError(
      "not_configured",
      "API Key is required for non-local AI endpoints.",
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return {
    baseURL: parsed.toString().replace(/\/$/, ""),
    apiKey: apiKey || undefined,
  };
}

function normalizeConfig(input?: Partial<AiRequestConfig>): AiRequestConfig {
  const endpoint = normalizeEndpointConfig(input);
  const hasExplicitConfig = input !== undefined;
  const model = (hasExplicitConfig ? input.model || "" : process.env.AI_MODEL || "").trim();

  if (!model) {
    throw new AiServiceError("not_configured", "AI service is not configured.");
  }

  return { ...endpoint, model };
}

function extractUpstreamMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  const error = value.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  const message = value.message;
  return typeof message === "string" ? message : "";
}

function classifyHttpError(status: number, upstreamMessage: string): AiServiceError {
  const lower = upstreamMessage.toLowerCase();
  if (status === 401 || status === 403) {
    return new AiServiceError("unauthorized", "API Key is invalid or lacks permission.", status);
  }
  if (status === 404) {
    const code = /model|deployment/.test(lower) ? "model_not_found" : "endpoint_not_found";
    return new AiServiceError(
      code,
      code === "model_not_found"
        ? "The configured model was not found."
        : "The AI endpoint was not found.",
      status,
    );
  }
  if (status === 429) {
    return new AiServiceError("rate_limited", "The AI service rate limit or quota was reached.", status);
  }
  if (status === 400 || status === 422) {
    return new AiServiceError("invalid_request", "The AI service rejected the request.", status);
  }
  return new AiServiceError("upstream_error", "The AI service is temporarily unavailable.", status);
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new AiServiceError("invalid_response", "AI service returned an invalid response.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiServiceError("invalid_response", "AI service returned no completion choices.");
  }
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const value = part as Record<string, unknown>;
        return typeof value.text === "string" ? value.text : "";
      })
      .join("")
      .trim();
    if (text) return text;
  }
  throw new AiServiceError("invalid_response", "AI service returned an empty completion.");
}


function extractModelOptions(payload: unknown): AiModelOption[] {
  let rawModels: unknown[] = [];
  if (Array.isArray(payload)) {
    rawModels = payload;
  } else if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    if (Array.isArray(value.data)) rawModels = value.data;
    else if (Array.isArray(value.models)) rawModels = value.models;
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
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const idValue = typeof item.id === "string" ? item.id : typeof item.model === "string" ? item.model : "";
    const id = idValue.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : undefined;
    const created = typeof item.created === "number" && Number.isFinite(item.created) ? item.created : undefined;
    const ownedBy = typeof item.owned_by === "string" && item.owned_by.trim() ? item.owned_by.trim() : undefined;
    models.push({ id, ...(name ? { name } : {}), ...(created !== undefined ? { created } : {}), ...(ownedBy ? { ownedBy } : {}) });
  }
  return models;
}

export async function listAiModels(
  input?: Partial<AiRequestConfig>,
  timeoutMs = 15_000,
): Promise<AiModelOption[]> {
  const config = normalizeEndpointConfig(input);
  const endpoint = `${config.baseURL}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchAiEndpoint(config, endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404) {
        throw new AiServiceError("endpoint_not_found", "The model catalog endpoint was not found.", 404);
      }
      throw classifyHttpError(response.status, extractUpstreamMessage(payload));
    }
    return extractModelOptions(payload);
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError("timeout", "AI service request timed out.");
    }
    const cause = error && typeof error === "object"
      ? (error as { cause?: { code?: string } }).cause
      : undefined;
    if (cause?.code === "ECONNREFUSED") {
      throw new AiServiceError("connection_refused", "Could not connect to the AI service.");
    }
    throw new AiServiceError("upstream_error", "Could not reach the AI service.");
  } finally {
    clearTimeout(timer);
  }
}

export function getResolvedAiConfig(input?: Partial<AiRequestConfig>): AiRequestConfig {
  return normalizeConfig(input);
}

export async function createChatCompletion(
  input: Partial<AiRequestConfig> | undefined,
  messages: ChatMessage[],
  timeoutMs = 30_000,
): Promise<string> {
  const config = normalizeConfig(input);
  const endpoint = `${config.baseURL}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchAiEndpoint(config, endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw classifyHttpError(response.status, extractUpstreamMessage(payload));
    }
    return extractAssistantText(payload);
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError("timeout", "AI service request timed out.");
    }
    const cause = error && typeof error === "object"
      ? (error as { cause?: { code?: string } }).cause
      : undefined;
    if (cause?.code === "ECONNREFUSED") {
      throw new AiServiceError("connection_refused", "Could not connect to the AI service.");
    }
    throw new AiServiceError("upstream_error", "Could not reach the AI service.");
  } finally {
    clearTimeout(timer);
  }
}

export async function testAiConnection(config?: Partial<AiRequestConfig>): Promise<void> {
  await createChatCompletion(
    config,
    [
      { role: "system", content: "You are a connectivity check." },
      { role: "user", content: "Reply only with OK." },
    ],
    15_000,
  );
}

export async function summarizeArticle(
  title: string,
  content?: string,
  snippet?: string,
  config?: Partial<AiRequestConfig>,
): Promise<string> {
  const articleText = (content || snippet || "").slice(0, 12_000);
  return createChatCompletion(config, [
    {
      role: "system",
      content:
        "You summarize RSS articles accurately. Do not add facts that are not in the source. " +
        "Use the article's primary language. Return clean Markdown.",
    },
    {
      role: "user",
      content: `请根据以下文章输出：
1. 2-3 句话的核心摘要
2. 3 条关键要点
3. 预计阅读时间

要求：
- 不添加原文中没有的信息
- 保留重要数字、人名和结论
- 使用原文主要语言回答

标题：${title || "Untitled"}
正文：${articleText}`,
    },
  ]);
}
