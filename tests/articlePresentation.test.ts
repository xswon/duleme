import { describe, expect, it } from "vitest";
import { resolveArticlePresentation } from "../src/services/articlePresentation";
import type { Article, RuntimeCapabilities } from "../src/types";

const article = (overrides: Partial<Article> = {}): Article => ({
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Feed",
  title: "Title",
  link: "https://example.com/article",
  content: "<p>Body</p>",
  snippet: "Body",
  pubDate: "2026-08-18T00:00:00.000Z",
  read: false,
  starred: false,
  ...overrides,
});

const runtime = (patch: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({
  aiConfigured: false,
  transcriptionAvailable: false,
  ...patch,
});

const enrichment = (status: "candidate" | "available" = "candidate") => ({
  provider: "bidclub" as const,
  episodeId: "episode-1",
  episodeUrl: "https://bidclub.ai/e/episode-1",
  status,
  matchedBy: status === "available" ? "api" as const : "legacy" as const,
});

describe("article presentation resolver", () => {
  it("keeps the AI summary entry visible when an article has no configured model", () => {
    const result = resolveArticlePresentation(article());
    expect(result.capabilities).toMatchObject({ hasOverview: false, canGenerateOverview: false });
    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("adds article AI summary generation only when AI is configured", () => {
    const result = resolveArticlePresentation(article(), {}, runtime({ aiConfigured: true }));
    expect(result.capabilities.canGenerateOverview).toBe(true);
    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("keeps a saved article summary visible after AI is disabled", () => {
    const result = resolveArticlePresentation(article({ aiSummary: "Saved summary" }));
    expect(result.capabilities).toMatchObject({ hasOverview: true, canGenerateOverview: false });
    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview"]);
  });

  it("keeps the AI summary entry visible for audio items when services are unconfigured", () => {
    const result = resolveArticlePresentation(article({ audioUrl: "https://cdn.example.com/e.mp3" }));
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("shows podcast transcript generation independently from article AI", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3" }),
      {},
      runtime({ transcriptionAvailable: true }),
    );
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "overview", label: "AI 摘要" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("keeps completed cloud transcripts visible without current transcription config", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/e.mp3",
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: "https://cdn.example.com/e.mp3",
          status: "completed",
          segments: [{ startMs: 0, text: "hello" }],
          updatedAt: "now",
        },
      }),
      {},
      runtime(),
    );
    expect(result.capabilities.hasTranscript).toBe(true);
    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview", "transcript"]);
  });

  it("keeps completed local transcripts visible without current transcription config", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/e.mp3",
        localPodcast: {
          sourceAudioUrl: "https://cdn.example.com/e.mp3",
          transcriptionStatus: "completed",
          insightStatus: "not_started",
          updatedAt: "now",
        },
      }),
      {},
      runtime(),
    );
    expect(result.capabilities.hasTranscript).toBe(true);
    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview", "transcript"]);
  });

  it("does not treat legacy podcast show-note aiSummary as a reliable overview", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3", aiSummary: "legacy" }),
      {},
      runtime({ transcriptionAvailable: true }),
    );
    expect(result.capabilities.hasOverview).toBe(false);
    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview", "transcript"]);
  });

  it("shows reliable provider digest independently from user AI configuration", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3", enrichment: enrichment("available") }),
      { status: "available", digest: "<p>Digest</p>" },
      runtime(),
    );
    expect(result.capabilities).toMatchObject({ hasOverview: true, hasDigest: true });
    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview"]);
  });

  it("shows provider transcript independently from current transcription config", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3", enrichment: enrichment("available") }),
      { status: "available", transcript: "<p>Transcript</p>" },
      runtime(),
    );
    expect(result.capabilities).toMatchObject({ hasOverview: false, hasTranscript: true });
    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview", "transcript"]);
  });

  it("does not surface digest-only enrichment as an article overview", () => {
    const result = resolveArticlePresentation(
      article({ enrichment: enrichment("available") }),
      { status: "available", digest: "<p>Digest only</p>" },
      runtime({ aiConfigured: true }),
    );
    expect(result.capabilities).toMatchObject({ hasOverview: false, canGenerateOverview: false });
    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("does not infer podcast state from titles", () => {
    const result = resolveArticlePresentation(article({ feedTitle: "Podcast", title: "Episode 12" }));
    expect(result.contentType).toBe("article");
  });
});
