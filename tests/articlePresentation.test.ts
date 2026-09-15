import { describe, expect, it } from "vitest";
import { resolveArticlePresentation } from "../src/services/articlePresentation";
import type { Article } from "../src/types";

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

const podcastTabs = [
  { key: "body", label: "节目介绍" },
  { key: "overview", label: "AI 摘要" },
  { key: "transcript", label: "逐字稿" },
];

describe("article presentation resolver", () => {
  it("gives a regular article the shared body-first tabs with a generatable overview", () => {
    const result = resolveArticlePresentation(article());

    expect(result).toMatchObject({
      contentType: "article",
      processingState: "raw",
      enrichmentStatus: "none",
      defaultTab: "body",
      capabilities: {
        hasAudio: false,
        hasBody: true,
        hasOverview: true,
        canGenerateOverview: true,
      },
    });
    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
  });

  it("drops the article overview tab when verified enrichment has no overview content", () => {
    const result = resolveArticlePresentation(
      article({ enrichment: enrichment("available") }),
      { status: "available", digest: "<p>Digest only</p>" }
    );

    expect(result.capabilities).toMatchObject({ hasOverview: false, canGenerateOverview: false });
    expect(result.tabs).toEqual([{ key: "body", label: "正文" }]);
  });

  it("uses real audio rather than a feed title to identify a raw podcast", () => {
    const result = resolveArticlePresentation(article({
      feedTitle: "Article Newsletter",
      audioUrl: "https://cdn.example.com/episode.mp3",
      aiSummary: "Legacy summary generated from show notes",
    }));

    expect(result).toMatchObject({
      contentType: "podcast",
      processingState: "raw",
      enrichmentStatus: "none",
      defaultTab: "body",
      capabilities: {
        hasAudio: true,
        hasOverview: false,
        hasTranscript: false,
        canGenerateOverview: false,
      },
    });
    expect(result.tabs).toEqual(podcastTabs);
  });

  it("shows a raw podcast overview only when a reliable one is supplied", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", aiSummary: "legacy show-notes summary" }),
      { overview: "Reliable transcript-based overview" }
    );

    expect(result.capabilities).toMatchObject({ hasOverview: true, canGenerateOverview: false });
    expect(result.tabs).toEqual(podcastTabs);
  });

  it("keeps the merged podcast tabs while a BidClub reference is only a candidate", () => {
    const result = resolveArticlePresentation(article({
      audioUrl: "https://cdn.example.com/episode.mp3",
      enrichment: enrichment(),
    }));

    expect(result).toMatchObject({
      contentType: "podcast",
      processingState: "raw",
      enrichmentStatus: "candidate",
      enrichmentProvider: "bidclub",
      defaultTab: "body",
    });
    expect(result.tabs).toEqual(podcastTabs);
  });

  it("shows only a real overview and marks enrichment available", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment("available") }),
      { status: "available", overview: "<p>TLDR</p>", digest: "", transcript: "  " }
    );

    expect(result).toMatchObject({ processingState: "digested", enrichmentStatus: "available", defaultTab: "body" });
    expect(result.tabs).toEqual(podcastTabs);
    expect(result.capabilities).toMatchObject({ hasOverview: true, hasDigest: false, hasTranscript: false });
  });

  it.each([
    ["digest", { digest: "<p>Digest</p>" }, "overview", "AI 摘要"],
    ["transcript", { transcript: "<p>Transcript</p>" }, "transcript", "逐字稿"],
  ] as const)("surfaces real %s content through the merged navigation", (_kind, content, key, label) => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment("available") }),
      { status: "available", ...content }
    );

    expect(result.tabs).toEqual(podcastTabs);
    expect(result.tabs).toContainEqual({ key, label });
    expect(result.defaultTab).toBe("body");
  });

  it("falls back to show notes when a successful response has no enrichment", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment("available") }),
      { status: "unavailable" }
    );

    expect(result).toMatchObject({ processingState: "raw", enrichmentStatus: "unavailable" });
    expect(result.defaultTab).toBe("body");
    expect(result.tabs).toEqual(podcastTabs);
  });

  it("keeps show notes readable when enrichment loading fails", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/episode.mp3", enrichment: enrichment() }),
      { status: "error" }
    );

    expect(result).toMatchObject({ processingState: "raw", enrichmentStatus: "error", defaultTab: "body" });
    expect(result.tabs).toEqual(podcastTabs);
  });

  it("does not trust legacy non-API availability without a successful detail payload", () => {
    const result = resolveArticlePresentation(article({
      audioUrl: "https://cdn.example.com/episode.mp3",
      enrichment: {
        provider: "bidclub",
        episodeId: "episode-1",
        status: "available",
        matchedBy: "source-url",
      },
    }));

    expect(result).toMatchObject({
      processingState: "raw",
      enrichmentStatus: "candidate",
    });
    expect(result.tabs).toEqual(podcastTabs);
  });

  it("does not infer an enrichment provider from an article link inside the presentation layer", () => {
    const legacyLike = article({
      content: "",
      snippet: "Legacy snippet",
      link: "https://bidclub.ai/e/legacy-episode",
      thumbnail: undefined,
    });
    const result = resolveArticlePresentation(legacyLike);

    expect(result).toMatchObject({
      contentType: "article",
      processingState: "raw",
      enrichmentStatus: "none",
      capabilities: { hasAudio: false, hasBody: true, hasCover: false },
    });
    expect(legacyLike).not.toHaveProperty("contentType");
    expect(legacyLike).not.toHaveProperty("processingState");
  });

  it("does not infer podcast or BidClub state from titles", () => {
    const result = resolveArticlePresentation(article({
      feedTitle: "BidClub Podcast",
      title: "Podcast episode 12",
    }));

    expect(result).toMatchObject({ contentType: "article", processingState: "raw" });
  });
});
