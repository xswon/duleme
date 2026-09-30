import { describe, expect, it } from "vitest";
import {
  buildAliyunTranscriptionBody,
  extractAliyunTaskId,
  mapTranscriptionProviderError,
  parseAliyunTaskState,
  parseAliyunTranscriptSegments,
} from "../src/services/transcriptionCore";

describe("transcription core", () => {
  it("builds the existing Qwen file-transcription request", () => {
    expect(buildAliyunTranscriptionBody({
      audioUrl: "https://cdn.example.com/a.mp3",
      language: "zh",
      diarization: true,
      context: "  show title and guest  ",
    })).toEqual({
      model: "qwen-audio-3.0-asr-flash-filetrans",
      input: {
        file_urls: ["https://cdn.example.com/a.mp3"],
        context: [{
          role: "user",
          content: [{ type: "input_text", text: "show title and guest" }],
        }],
      },
      parameters: {
        channel_id: [0],
        diarization_enabled: true,
        language_hints: ["zh"],
      },
    });
  });

  it("normalizes task ids and task states", () => {
    expect(extractAliyunTaskId({ output: { task_id: " task-1 " } })).toBe("task-1");
    expect(parseAliyunTaskState({ output: { task_status: "RUNNING" } })).toEqual({
      status: "processing",
    });
    expect(parseAliyunTaskState({
      output: {
        task_status: "SUCCEEDED",
        results: [{
          subtask_status: "SUCCEEDED",
          transcription_url: "https://result.example.com/a.json",
        }],
      },
    })).toEqual({
      status: "completed",
      transcriptionUrl: "https://result.example.com/a.json",
    });
  });

  it("maps failed subtasks into stable product errors", () => {
    expect(parseAliyunTaskState({
      output: {
        task_status: "SUCCEEDED",
        results: [{
          subtask_status: "FAILED",
          code: "FILE_DOWNLOAD_FAILED",
          message: "file download failed",
        }],
      },
    })).toEqual({
      status: "failed",
      error: { code: "audio_unreachable", status: 400 },
    });
    expect(mapTranscriptionProviderError(429, { message: "quota reached" })).toEqual({
      code: "quota_exceeded",
      status: 429,
    });
  });

  it("maps recognition sentences and speaker ids", () => {
    expect(parseAliyunTranscriptSegments({
      transcripts: [{
        sentences: [
          { begin_time: 10, end_time: 30, text: "你好", speaker_id: 0 },
          { begin_time: 31, end_time: 50, text: " 世界 " },
          { begin_time: 51, end_time: 60, text: "   " },
        ],
      }],
    })).toEqual([
      { startMs: 10, endMs: 30, text: "你好", speaker: "说话人 1" },
      { startMs: 31, endMs: 50, text: "世界" },
    ]);
  });
});
