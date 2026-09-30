import { assertSafePublicHttpUrl, fetchPublicHttp } from "./outboundNetwork";
import {
  buildAliyunTranscriptionBody,
  extractAliyunTaskId,
  mapTranscriptionProviderError,
  parseAliyunTaskState,
  parseAliyunTranscriptSegments,
  transcriptionErrorMessage,
  type TranscriptSegment,
  type TranscriptionErrorCode,
} from "../../src/services/transcriptionCore";

export type { TranscriptSegment, TranscriptionErrorCode } from "../../src/services/transcriptionCore";
export { transcriptionErrorMessage } from "../../src/services/transcriptionCore";

export class TranscriptionError extends Error {
  constructor(
    public code: TranscriptionErrorCode,
    message?: string,
    public status = 502,
  ) {
    super(message || transcriptionErrorMessage(code));
  }
}

export async function validatePublicAudioUrl(value: string) {
  try {
    await assertSafePublicHttpUrl(value);
  } catch {
    throw new TranscriptionError(
      "audio_unreachable",
      "音频地址不可访问或指向私有网络。",
      400,
    );
  }
}

export interface TranscriptionProvider {
  testConnection(apiKey: string): Promise<void>;
  submit(input: {
    apiKey: string;
    audioUrl: string;
    language?: string;
    diarization?: boolean;
    context?: string;
  }): Promise<{ taskId: string }>;
  poll(input: {
    apiKey: string;
    taskId: string;
  }): Promise<{
    status: "processing" | "completed" | "failed";
    segments?: TranscriptSegment[];
    error?: TranscriptionError;
  }>;
}

function asTranscriptionError(status: number, payload: unknown): TranscriptionError {
  const mapped = mapTranscriptionProviderError(status, payload);
  return new TranscriptionError(mapped.code, undefined, mapped.status);
}

async function call(url: string, apiKey: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetchPublicHttp(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new TranscriptionError("timeout");
    }
    throw new TranscriptionError("provider_unavailable");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw asTranscriptionError(response.status, payload);
  return payload;
}

export class AliyunTranscriptionProvider implements TranscriptionProvider {
  private base = "https://dashscope.aliyuncs.com/api/v1";

  async testConnection(apiKey: string) {
    if (!apiKey.trim()) {
      throw new TranscriptionError("invalid_credentials", "请先填写 API Key。", 400);
    }
    try {
      await call(`${this.base}/tasks/__wreader_connection_test__`, apiKey);
    } catch (error) {
      if (error instanceof TranscriptionError && error.code === "unknown" && error.status === 404) return;
      throw error;
    }
  }

  async submit(input: {
    apiKey: string;
    audioUrl: string;
    language?: string;
    diarization?: boolean;
    context?: string;
  }) {
    await validatePublicAudioUrl(input.audioUrl);
    const payload = await call(
      `${this.base}/services/audio/asr/transcription`,
      input.apiKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(buildAliyunTranscriptionBody(input)),
      },
    );
    const taskId = extractAliyunTaskId(payload);
    if (!taskId) throw new TranscriptionError("unknown");
    return { taskId };
  }

  async poll(input: { apiKey: string; taskId: string }) {
    const payload = await call(
      `${this.base}/tasks/${encodeURIComponent(input.taskId)}`,
      input.apiKey,
    );
    const task = parseAliyunTaskState(payload);
    if (task.status === "processing") return task;
    if (task.status === "failed") {
      return {
        status: "failed" as const,
        error: new TranscriptionError(task.error.code, undefined, task.error.status),
      };
    }

    const raw = await fetchPublicHttp(task.transcriptionUrl, {
      signal: AbortSignal.timeout(30_000),
    }).then(async (response) => (
      response.ok
        ? response.json()
        : Promise.reject(new TranscriptionError("provider_unavailable"))
    )).catch((error) => {
      throw error instanceof TranscriptionError
        ? error
        : new TranscriptionError("provider_unavailable");
    });

    return {
      status: "completed" as const,
      segments: parseAliyunTranscriptSegments(raw),
    };
  }
}

export const transcriptionProvider: TranscriptionProvider = new AliyunTranscriptionProvider();
