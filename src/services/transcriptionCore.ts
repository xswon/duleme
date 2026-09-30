export type TranscriptionErrorCode =
  | "invalid_credentials"
  | "permission_required"
  | "quota_exceeded"
  | "audio_unreachable"
  | "audio_unsupported"
  | "provider_unavailable"
  | "timeout"
  | "unknown";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionSubmitInput {
  audioUrl: string;
  language?: string;
  diarization?: boolean;
  context?: string;
}

export interface TranscriptionFailure {
  code: TranscriptionErrorCode;
  status: number;
}

export type TranscriptionTaskState =
  | { status: "processing" }
  | { status: "completed"; transcriptionUrl: string }
  | { status: "failed"; error: TranscriptionFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const transcriptionErrorMessage = (code: TranscriptionErrorCode) => ({
  invalid_credentials: "API Key 无效或已失效，请重新填写。",
  permission_required: "该 API Key 没有调用转录服务的权限。",
  quota_exceeded: "转录额度不足或已超出限额。",
  audio_unreachable: "阿里云无法访问该公网音频地址。",
  audio_unsupported: "音频格式、大小或时长不受支持。",
  provider_unavailable: "阿里云百炼暂时不可用，请稍后重试。",
  timeout: "转录请求超时，请稍后重试。",
  unknown: "转录失败，请稍后重试。",
}[code]);

export function mapTranscriptionProviderError(status: number, payload: unknown): TranscriptionFailure {
  const body = isRecord(payload) ? payload : {};
  const source = `${typeof body.code === "string" ? body.code : ""} ${
    typeof body.message === "string"
      ? body.message
      : typeof body.error === "string"
        ? body.error
        : ""
  }`.toLowerCase();

  const code: TranscriptionErrorCode =
    status === 401
      ? "invalid_credentials"
      : status === 403
        ? "permission_required"
        : status === 429 || /quota|balance|limit/.test(source)
          ? "quota_exceeded"
          : /file.*(download|not.?found)|url.*(access|download)/.test(source)
            ? "audio_unreachable"
            : /format|duration|size|unsupported/.test(source)
              ? "audio_unsupported"
              : status >= 500
                ? "provider_unavailable"
                : "unknown";

  return {
    code,
    status: status >= 400 && status < 500 ? status : 502,
  };
}

export function buildAliyunTranscriptionBody(input: TranscriptionSubmitInput) {
  const parameters: Record<string, unknown> = {
    channel_id: [0],
    diarization_enabled: input.diarization !== false,
  };
  if (input.language && input.language !== "auto") {
    parameters.language_hints = [input.language];
  }

  const context = input.context?.trim().slice(0, 400);
  const body: {
    model: string;
    input: {
      file_urls: string[];
      context?: Array<{ role: "user"; content: Array<{ type: "input_text"; text: string }> }>;
    };
    parameters: Record<string, unknown>;
  } = {
    model: "qwen-audio-3.0-asr-flash-filetrans",
    input: { file_urls: [input.audioUrl] },
    parameters,
  };
  if (context) {
    body.input.context = [{
      role: "user",
      content: [{ type: "input_text", text: context }],
    }];
  }
  return body;
}

export function extractAliyunTaskId(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.output)) return null;
  const taskId = payload.output.task_id;
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
}

export function parseAliyunTaskState(payload: unknown): TranscriptionTaskState {
  if (!isRecord(payload) || !isRecord(payload.output)) {
    return { status: "failed", error: { code: "unknown", status: 502 } };
  }
  const output = payload.output;
  const status = typeof output.task_status === "string" ? output.task_status.toUpperCase() : "";

  if (status === "PENDING" || status === "RUNNING") {
    return { status: "processing" };
  }

  const results = Array.isArray(output.results) ? output.results : [];
  const result = isRecord(results[0]) ? results[0] : {};
  const subtaskStatus = typeof result.subtask_status === "string"
    ? result.subtask_status.toUpperCase()
    : "";

  if (
    status !== "SUCCEEDED"
    || subtaskStatus === "FAILED"
    || typeof result.transcription_url !== "string"
    || !result.transcription_url.trim()
  ) {
    return {
      status: "failed",
      error: mapTranscriptionProviderError(400, result),
    };
  }

  return {
    status: "completed",
    transcriptionUrl: result.transcription_url.trim(),
  };
}

export function parseAliyunTranscriptSegments(payload: unknown): TranscriptSegment[] {
  if (!isRecord(payload) || !Array.isArray(payload.transcripts)) return [];

  const segments: TranscriptSegment[] = [];
  for (const rawTranscript of payload.transcripts) {
    if (!isRecord(rawTranscript) || !Array.isArray(rawTranscript.sentences)) continue;
    for (const rawSentence of rawTranscript.sentences) {
      if (!isRecord(rawSentence)) continue;
      const text = typeof rawSentence.text === "string" ? rawSentence.text.trim() : "";
      if (!text) continue;
      const startMs = Number(rawSentence.begin_time || 0);
      const endMs = Number(rawSentence.end_time || 0);
      const speakerId = rawSentence.speaker_id;
      segments.push({
        startMs: Number.isFinite(startMs) ? startMs : 0,
        endMs: Number.isFinite(endMs) ? endMs : 0,
        text,
        ...(speakerId === undefined || speakerId === null
          ? {}
          : { speaker: `说话人 ${Number(speakerId) + 1}` }),
      });
    }
  }
  return segments;
}
