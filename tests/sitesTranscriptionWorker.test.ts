import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSitesTranscriptionRequest } from "../src/sites/transcriptionWorker";

function request(path: string, body: unknown, init: RequestInit = {}) {
  return new Request(`https://reader.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

describe("Sites transcription worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("treats an authenticated missing probe task as a successful connection test", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://dashscope.aliyuncs.com/api/v1/tasks/__wreader_connection_test__");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-test");
      return new Response(JSON.stringify({ code: "InvalidTaskId", message: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await handleSitesTranscriptionRequest(
      request("/api/transcription/settings/test", { apiKey: "sk-test" }),
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("submits the fixed async Qwen file-transcription request", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription");
      expect(new Headers(init?.headers).get("X-DashScope-Async")).toBe("enable");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-test");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "qwen-audio-3.0-asr-flash-filetrans",
        input: { file_urls: ["https://cdn.example.com/a.mp3"] },
        parameters: { diarization_enabled: true, language_hints: ["zh"] },
      });
      return new Response(JSON.stringify({ output: { task_id: "task-1" } }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await handleSitesTranscriptionRequest(
      request("/api/transcription/tasks", {
        apiKey: "sk-test",
        audioUrl: "https://cdn.example.com/a.mp3",
        language: "zh",
        diarization: true,
        context: "Show and guest",
      }),
      { fetchImpl },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      taskId: "task-1",
      status: "processing",
    });
  });

  it("rejects private and credential-bearing audio URLs before provider access", async () => {
    const fetchImpl = vi.fn();
    for (const audioUrl of [
      "http://127.0.0.1/a.mp3",
      "https://localhost/a.mp3",
      "https://user:pass@example.com/a.mp3",
      "file:///tmp/a.mp3",
    ]) {
      const response = await handleSitesTranscriptionRequest(
        request("/api/transcription/tasks", {
          apiKey: "sk-test",
          audioUrl,
          language: "auto",
          diarization: true,
        }),
        { fetchImpl },
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "audio_unreachable" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("polls a completed task and downloads a public result without forwarding the API key", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/tasks/task-1")) {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-test");
        return new Response(JSON.stringify({
          output: {
            task_status: "SUCCEEDED",
            results: [{
              subtask_status: "SUCCEEDED",
              transcription_url: "https://result.example.com/a.json?sig=test",
            }],
          },
        }), { headers: { "Content-Type": "application/json" } });
      }
      expect(url).toBe("https://result.example.com/a.json?sig=test");
      expect(new Headers(init?.headers).get("Authorization")).toBeNull();
      return new Response(JSON.stringify({
        transcripts: [{
          sentences: [
            { begin_time: 10, end_time: 30, text: "你好", speaker_id: 0 },
          ],
        }],
      }), { headers: { "Content-Type": "application/json" } });
    });

    const response = await handleSitesTranscriptionRequest(
      request("/api/transcription/tasks/task-1/poll", { apiKey: "sk-test" }),
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "completed",
      segments: [{ startMs: 10, endMs: 30, text: "你好", speaker: "说话人 1" }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns processing and provider-declared failed states without losing error codes", async () => {
    const processing = await handleSitesTranscriptionRequest(
      request("/api/transcription/tasks/task-1/poll", { apiKey: "sk-test" }),
      {
        fetchImpl: async () => new Response(JSON.stringify({
          output: { task_status: "RUNNING" },
        }), { headers: { "Content-Type": "application/json" } }),
      },
    );
    await expect(processing.json()).resolves.toEqual({ status: "processing" });

    const failed = await handleSitesTranscriptionRequest(
      request("/api/transcription/tasks/task-2/poll", { apiKey: "sk-test" }),
      {
        fetchImpl: async () => new Response(JSON.stringify({
          output: {
            task_status: "SUCCEEDED",
            results: [{
              subtask_status: "FAILED",
              code: "FILE_DOWNLOAD_FAILED",
              message: "URL access failed",
            }],
          },
        }), { headers: { "Content-Type": "application/json" } }),
      },
    );
    await expect(failed.json()).resolves.toMatchObject({
      status: "failed",
      code: "audio_unreachable",
    });
  });

  it("blocks unsafe transcript result URLs supplied by the provider", async () => {
    const response = await handleSitesTranscriptionRequest(
      request("/api/transcription/tasks/task-1/poll", { apiKey: "sk-test" }),
      {
        fetchImpl: async () => new Response(JSON.stringify({
          output: {
            task_status: "SUCCEEDED",
            results: [{
              subtask_status: "SUCCEEDED",
              transcription_url: "http://127.0.0.1/result.json",
            }],
          },
        }), { headers: { "Content-Type": "application/json" } }),
      },
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("maps provider authentication failures without returning the API key", async () => {
    const response = await handleSitesTranscriptionRequest(
      request("/api/transcription/settings/test", { apiKey: "sk-secret" }),
      {
        fetchImpl: async () => new Response(JSON.stringify({
          message: "bad key sk-secret",
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      },
    );
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).not.toContain("sk-secret");
    expect(JSON.parse(text)).toMatchObject({ code: "invalid_credentials" });
  });

  it("rejects malformed task ids before provider access", async () => {
    const fetchImpl = vi.fn();
    const response = await handleSitesTranscriptionRequest(
      request("/api/transcription/tasks/..%2Fadmin/poll", { apiKey: "sk-test" }),
      { fetchImpl },
    );
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports provider timeouts", async () => {
    vi.useFakeTimers();
    const pending = handleSitesTranscriptionRequest(
      request("/api/transcription/settings/test", { apiKey: "sk-test" }),
      {
        timeoutMs: 25,
        fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      },
    );
    await vi.advanceTimersByTimeAsync(25);
    const response = await pending;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ code: "timeout" });
  });
});
