import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSitesAiRequest } from "../src/sites/aiWorker";

const config = {
  baseURL: "https://api.example.com/v1",
  apiKey: "sk-secret",
  model: "model-1",
};

function aiRequest(path: string, body?: unknown, init: RequestInit = {}) {
  return new Request(`https://reader.example${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? init.headers : {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
}

function completion(content = "OK") {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Sites AI worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports no server-owned environment configuration in Sites", async () => {
    const response = await handleSitesAiRequest(aiRequest("/api/ai/status"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false });
  });

  it("loads models through a fixed public HTTPS endpoint without returning credentials", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/models");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-secret");
      return new Response(JSON.stringify({
        data: [
          { id: "model-a", owned_by: "provider" },
          { id: "model-b", name: "Model B" },
        ],
      }), { headers: { "Content-Type": "application/json" } });
    });

    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/models", { config }),
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("sk-secret");
    expect(JSON.parse(text)).toEqual({
      models: [
        { id: "model-a", ownedBy: "provider" },
        { id: "model-b", name: "Model B" },
      ],
    });
  });

  it("rejects plaintext, loopback, and credential-bearing AI base URLs before fetch", async () => {
    const fetchImpl = vi.fn();
    for (const baseURL of [
      "http://api.example.com/v1",
      "http://127.0.0.1:11434/v1",
      "https://localhost:11434/v1",
      "https://user:pass@example.com/v1",
    ]) {
      const response = await handleSitesAiRequest(
        aiRequest("/api/ai/models", { config: { ...config, baseURL } }),
        { fetchImpl },
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "invalid_config" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not follow an authenticated redirect to another origin", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { Location: "https://evil.example/steal" },
    }));

    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/models", { config }),
      { fetchImpl },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_config" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tests a configured model through chat completions", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("model-1");
      expect(body.messages.at(-1)?.content).toContain("OK");
      return completion("OK");
    });

    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/test", { config }),
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      latencyMs: expect.any(Number),
    });
  });

  it("summarizes an article with the shared summary orchestration", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(JSON.stringify(body.messages)).toContain("Article body");
      return completion("## Summary\n- Point");
    });

    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/summarize", {
        title: "Article",
        content: "Article body",
        snippet: "",
        source: "article",
        config,
      }),
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ summary: "## Summary\n- Point" });
  });

  it("streams progress and the final summary as NDJSON", async () => {
    const fetchImpl = vi.fn(async () => completion("Stream summary"));
    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/summarize?stream=1", {
        title: "Article",
        content: "Body",
        source: "article",
        config,
      }),
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toContainEqual({ type: "progress", progress: 15 });
    expect(lines).toContainEqual({ type: "progress", progress: 100 });
    expect(lines.at(-1)).toEqual({ type: "result", summary: "Stream summary" });
  });

  it("maps provider errors without echoing API keys or upstream secret text", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "bad key sk-secret" },
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }));

    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/test", { config }),
      { fetchImpl },
    );
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).not.toContain("sk-secret");
    expect(JSON.parse(text)).toMatchObject({
      code: "unauthorized",
      upstreamStatus: 401,
    });
  });

  it("requires an API key and model where the operation needs them", async () => {
    const noKey = await handleSitesAiRequest(
      aiRequest("/api/ai/models", { config: { baseURL: config.baseURL } }),
    );
    expect(noKey.status).toBe(400);
    await expect(noKey.json()).resolves.toMatchObject({ code: "not_configured" });

    const noModel = await handleSitesAiRequest(
      aiRequest("/api/ai/test", { config: { baseURL: config.baseURL, apiKey: config.apiKey } }),
    );
    expect(noModel.status).toBe(400);
    await expect(noModel.json()).resolves.toMatchObject({ code: "not_configured" });
  });

  it("reports upstream timeouts", async () => {
    vi.useFakeTimers();
    const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

    const pending = handleSitesAiRequest(
      aiRequest("/api/ai/test", { config }),
      { fetchImpl },
    );
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await pending;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ code: "timeout" });
  });

  it("rejects oversized request bodies before provider access", async () => {
    const fetchImpl = vi.fn();
    const response = await handleSitesAiRequest(
      aiRequest("/api/ai/summarize", {
        title: "Article",
        content: "12345",
        config,
      }),
      { fetchImpl, maxRequestBytes: 4 },
    );
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
