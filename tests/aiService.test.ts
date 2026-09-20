import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiServiceError,
  createChatCompletion,
} from "../server/services/aiService";

const remoteConfig = {
  baseURL: "https://api.example.com/v1",
  apiKey: "sk-secret",
  model: "model-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI-compatible AI client", () => {
  it("calls chat/completions and sends bearer auth for remote endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Summary" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .resolves.toBe("Summary");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-secret" }),
      }),
    );
  });

  it("allows loopback endpoints without manufacturing an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await createChatCompletion(
      { baseURL: "http://127.0.0.1:11434/v1", model: "local-model" },
      [{ role: "user", content: "hello" }],
    );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [500, "upstream_error"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "upstream detail" },
    }), { status, headers: { "Content-Type": "application/json" } })));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ code });
  });

  it("distinguishes a model-shaped 404 without echoing provider secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "model not found; sk-secret should never be echoed" },
    }), { status: 404, headers: { "Content-Type": "application/json" } })));

    try {
      await createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AiServiceError);
      expect((error as AiServiceError).code).toBe("model_not_found");
      expect((error as Error).message).not.toContain("sk-secret");
    }
  });

  it("maps connection refused", async () => {
    const error = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ code: "connection_refused" });
  });

  it("maps aborts to timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => (
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    )));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }], 1))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects an empty compatible response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ code: "invalid_response" });
  });
});
