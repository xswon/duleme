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

const enrichment = (status: "candidate" | "available" = "candidate") => ({
  provider: "bidclub" as const,
  episodeId: "episode-1",
  episodeUrl: "https://bidclub.ai/e/episode-1",
  status,
  matchedBy: status === "available" ? "api" as const : "legacy" as const,
});

const runtime = (patch: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({
  aiConfigured: false,
  transcriptionAvailable: true,
  ...patch,
});

describe("article presentation resolver", () => {
  it("keeps a regular article body-only when AI is not configured", () => {
    const result = resolveArticlePresentation(article());

    expect(result.capabilities).toMatchObject({
      hasAudio: false,
      hasBody: true,
      hasOverview: false,
      canGenerateOverview: false,
    });
    expect(result.tabs).toEqual([{ key: "body", label: "正文" }]);
    expect(result.defaultTab).toBe("body");
  });

  it("adds a generatable AI summary only when runtime AI is configured", () => {
    const result = resolveArticlePresentation(article(), {}, runtime({ aiConfigured: true }));

    expect(result.capabilities).toMatchObject({ hasOverview: false, canGenerateOverview: true });
    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("keeps an existing article summary readable after AI is disabled", () => {
    const result = resolveArticlePresentation(article({ aiSummary: "Saved summary" }));

    expect(result.capabilities).toMatchObject({ hasOverview: true, canGenerateOverview: false });
    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("does not surface digest-only enrichment as an article overview", () => {
    const result = resolveArticlePresentation(
      article({ enrichment: enrichment("available") }),
      { status: "available", digest: "<p>Digest only</p>" },
      runtime({ aiConfigured: true }),
    );

    expect(result.capabilities).toMatchObject({ hasOverview: false, canGenerateOverview: false });
    expect(result.tabs).toEqual([{ key: "body", label: "正文" }]);
  });

  it("does not treat a legacy show-notes aiSummary as a reliable podcast overview", () => {
    const result = resolveArticlePresentation(article({
      audioUrl: "https://cdn.example.com/episode.mp3",
      aiSummary: "Legacy summary generated from show notes",
    }));

    expect(result.capabilities).toMatchObject({
      hasAudio: true,
      hasOverview: false,
      hasTranscript: false,
      canGenerateOverview: false,
    });
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("shows a podcast overview only when reliable overview/digest content exists", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3" }),
      { overview: "Reliable transcript-based overview" },
    );

    expect(result.capabilities).toMatchObject({ hasOverview: true, canGenerateOverview: false });
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "overview", label: "AI 摘要" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("keeps a candidate podcast focused on show notes and transcription", () => {
    const result = resolveArticlePresentation(article({
      audioUrl: "https://cdn.example.com/episode.mp3",
      enrichment: enrichment(),
    }));

    expect(result).toMatchObject({
      contentType: "podcast",
      processingState: "raw",
      enrichmentStatus: "candidate",
      defaultTab: "body",
    });
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("surfaces provider digest through the merged podcast overview tab", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment("available") }),
      { status: "available", digest: "<p>Digest</p>" },
    );

    expect(result.capabilities).toMatchObject({ hasOverview: true, hasDigest: true });
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "overview", label: "AI 摘要" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("does not show a podcast AI summary tab for transcript-only content", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment("available") }),
      { status: "available", transcript: "<p>Transcript</p>" },
    );

    expect(result.capabilities).toMatchObject({ hasOverview: false, hasTranscript: true });
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("hides generation-only transcript navigation when transcription is unavailable", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3" }),
      {},
      runtime({ transcriptionAvailable: false }),
    );

    expect(result.tabs).toEqual([{ key: "body", label: "节目介绍" }]);
  });

  it("keeps an existing local transcript visible when transcription is unavailable", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/episode.mp3",
        localPodcast: {
          sourceAudioUrl: "https://cdn.example.com/episode.mp3",
          transcriptionStatus: "completed",
          insightStatus: "not_started",
          updatedAt: "now",
        },
      }),
      {},
      runtime({ transcriptionAvailable: false }),
    );

    expect(result.capabilities.hasTranscript).toBe(true);
    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "transcript", label: "逐字稿" },
    ]);
  });

  it("keeps show notes readable when enrichment loading fails", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment() }),
      { status: "error" },
    );

    expect(result).toMatchObject({ processingState: "raw", enrichmentStatus: "error", defaultTab: "body" });
    expect(result.tabs[0]).toEqual({ key: "body", label: "节目介绍" });
  });

  it("does not infer podcast or BidClub state from titles", () => {
    const result = resolveArticlePresentation(article({
      feedTitle: "BidClub Podcast",
      title: "Podcast episode 12",
    }));

    expect(result).toMatchObject({ contentType: "article", processingState: "raw" });
  });
});
