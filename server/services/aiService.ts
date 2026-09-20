export interface AiRequestConfig {
  baseURL: string;
  apiKey?: string;
  model: string;
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
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function normalizeConfig(input?: Partial<AiRequestConfig>): AiRequestConfig {
  const baseURL = (input?.baseURL || process.env.AI_BASE_URL || "").trim();
  const apiKey = (input?.apiKey ?? process.env.AI_API_KEY ?? "").trim();
  const model = (input?.model || process.env.AI_MODEL || "").trim();

  if (!baseURL || !model) {
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
    model,
  };
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
    const response = await fetch(endpoint, {
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
