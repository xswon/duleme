import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArticleInsightTabs, InsightModel } from "../src/components/ArticleInsightTabs";
import { Article } from "../src/types";

const article: Article = {
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Example",
  title: "An article",
  link: "https://example.com/article",
  content: "<p>Readable body</p>",
  snippet: "Readable fallback",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
};

function renderModel(patch: Partial<InsightModel> = {}) {
  const model: InsightModel = {
    article,
    tab: "body",
    summary: null,
    canGenerateSummary: false,
    enrichmentLoading: false,
    enrichmentError: null,
    onSummarize: vi.fn(),
    summarizing: false,
    summaryError: null,
    ...patch,
  };
  return renderToStaticMarkup(<ArticleInsightTabs model={model} />);
}

function parseMarkup(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("ArticleInsightTabs", () => {
  it("offers only an explicit cloud transcription action for an untouched podcast", () => {
    const html = renderModel({ article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" }, tab: "transcript" });
    expect(html).toContain("生成逐字稿");
    expect(html).toContain("使用已配置的转录服务生成逐字稿");
    expect(html).not.toContain("阿里云百炼 API Key");
    expect(html).not.toContain("使用 AI 整理");
  });

  it("keeps cloud transcription available after an unrelated fetch error", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", localPodcast: { sessionId: "session-1", jobId: "job-1", sourceAudioUrl: "https://cdn.example.com/a.mp3", transcriptionStatus: "completed", insightStatus: "not_started", updatedAt: "now" } },
      tab: "transcript",
      localFetchError: "Failed to fetch",
    });
    expect(html).toContain("生成逐字稿");
    expect(html).toContain("Failed to fetch");
    expect(html).not.toContain("使用本机生成逐字稿");
  });

  it("shows local transcript timestamps only to the minute", () => {
    const html = renderModel({
      article: {
        ...article,
        audioUrl: "https://cdn.example.com/a.mp3",
        localPodcast: { sourceAudioUrl: "https://cdn.example.com/a.mp3", transcriptionStatus: "completed", insightStatus: "not_started", updatedAt: "now" },
      },
      tab: "transcript",
      localArtifacts: {
        transcript: [
          { startMs: 754000, timestamp: "00:12:34,000", text: "第一段" },
          { startMs: 6523000, timestamp: "01:48:43,000", text: "第二段" },
        ],
      },
    });
    const buttons = Array.from(parseMarkup(html).querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["12:00", "108:00"]);
    expect(html).toContain('data-transcript-start-ms="754000"');
    expect(html).toContain('data-transcript-start-ms="6523000"');
    expect(html).not.toContain("00:12:34,000");
    expect(html).not.toContain("01:48:43,000");
  });

  it("prefers BidClub content while local artifacts can fill missing tabs", () => {
    const bidclub = renderModel({ article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" }, tab: "overview", overviewHtml: "<p>BidClub wins</p>", localArtifacts: { transcript: [], digest: { one_sentence: "Local fallback" } } });
    const local = renderModel({ article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", localPodcast: { sourceAudioUrl: "https://cdn.example.com/a.mp3", transcriptionStatus: "completed", insightStatus: "completed", updatedAt: "now" } }, tab: "digest", localArtifacts: { transcript: [], digest: { chapters: [{ title: "Local chapter", summary: "Local summary" }] } } });
    expect(bidclub).toContain("BidClub wins");
    expect(bidclub).not.toContain("Local fallback");
    expect(local).toContain("Local chapter");
    expect(local).toContain("Local summary");
  });

  it("labels distinct AI evidence clearly and hides duplicate article links", () => {
    const distinct = renderModel({
      tab: "overview",
      overviewHtml: "<p>Prepared highlights</p>",
      sourceUrl: "https://youtube.com/watch?v=1",
      sourceLabel: "YouTube",
    });
    const duplicate = renderModel({
      tab: "overview",
      overviewHtml: "<p>Prepared highlights</p>",
      sourceUrl: article.link,
      sourceLabel: "Example",
    });

    expect(distinct).toContain("摘要依据");
    expect(distinct).toContain("YouTube");
    expect(duplicate).not.toContain("摘要依据");
  });

  it("keeps the body available when BidClub enrichment fails", () => {
    const html = renderModel({ tab: "body", enrichmentError: "BidClub unavailable" });
    expect(html).toContain("Readable body");
    expect(html).not.toContain("BidClub unavailable");
  });

  it("keeps the body available while enrichment is loading", () => {
    const html = renderModel({ tab: "body", enrichmentLoading: true });
    expect(html).toContain("Readable body");
    expect(html).not.toContain("正在加载整理内容");
  });

  it("does not offer AI generation when the capability is unavailable", () => {
    const html = renderModel({ tab: "overview", overviewHtml: "<p>Prepared highlights</p>" });
    expect(html).toContain("Prepared highlights");
    expect(html).not.toContain("生成文章概要");
  });

  it("scopes enrichment errors to enriched content", () => {
    const html = renderModel({ tab: "digest", enrichmentError: "BidClub unavailable" });
    expect(html).toContain("BidClub unavailable");
    expect(html).not.toContain("Readable body");
  });

  it("renders BidClub overview Markdown without exposing formatting markers", () => {
    const html = renderModel({
      tab: "overview",
      overviewHtml: "**核心观点**：正文说明\n\n- 第一项\n- 第二项",
    });
    expect(html).toContain('class="reader-content bidclub-overview"');
    expect(html).toContain("<strong>核心观点</strong>");
    expect(html).toContain("<ul>");
    expect(html).not.toContain("**");
  });

  it("keeps overview list items semantic so CSS can mark only bold-led viewpoints", () => {
    const html = renderModel({
      tab: "overview",
      overviewHtml: "<ul><li><strong>核心观点</strong>：正文说明</li><li>补充说明，不是观点标题</li></ul>",
    });
    const document = parseMarkup(html);
    const items = Array.from(document.querySelectorAll(".bidclub-overview li"));

    expect(items).toHaveLength(2);
    expect(items[0].querySelector(":scope > strong")?.textContent).toBe("核心观点");
    expect(items[1].querySelector(":scope > strong")).toBeNull();
    expect(items[1].textContent).toBe("补充说明，不是观点标题");
  });

  it("keeps BidClub digest headings and real lists semantic", () => {
    const html = renderModel({
      tab: "digest",
      digestHtml: "## 第一章\n\n普通段落。\n\n1. 结论一\n2. 结论二",
    });
    expect(html).toContain('class="reader-content bidclub-digest"');
    expect(html).toContain("<h2");
    expect(html).toContain("<ol>");
    expect(html).not.toContain("**");
  });

  it("keeps paragraph-shaped highlights and digest sub-points separated", () => {
    const overview = renderModel({
      tab: "overview",
      overviewHtml: "<p><strong>观点标题</strong>：观点正文</p>",
    });
    const digest = renderModel({
      tab: "digest",
      digestHtml: "## 1.观点\n\n第一段。\n\n第二段。",
    });

    expect(overview).toContain('class="reader-content bidclub-overview"');
    expect(overview).toContain("<p><strong>观点标题</strong>：观点正文</p>");
    expect(digest).toContain('class="reader-content bidclub-digest"');
    expect(digest.match(/<p>/g)).toHaveLength(2);
  });

  it("keeps the digest introduction outside the rich-text surface without stacked utility spacing", () => {
    const html = renderModel({
      tab: "digest",
      dek: "摘要导语",
      digestHtml: "## 第一章\n\n第一段。\n\n第二段。\n\n第三段。",
    });
    const document = parseMarkup(html);
    const layout = document.querySelector(".audio-insight-layout");
    const digest = layout?.querySelector(".audio-deep-summary .bidclub-digest");

    expect(layout).not.toBeNull();
    expect(layout?.classList.contains("space-y-5")).toBe(false);
    expect(layout?.querySelector(":scope > .space-y-5")).toBeNull();
    expect(layout?.querySelector(".audio-deep-summary-toggle")?.textContent).toContain("展开深度精华");
    expect(layout?.querySelector(".audio-deep-summary")?.hasAttribute("hidden")).toBe(true);
    expect(layout?.querySelector(".audio-deep-summary > p")?.textContent).toBe("摘要导语");
    expect(digest?.querySelector(":scope > h2")?.textContent).toBe("第一章");
  });

  it("renders three ordinary digest paragraphs as separate top-level paragraphs", () => {
    const html = renderModel({
      tab: "digest",
      digestHtml: "## 第一章\n\n第一段。\n\n第二段。\n\n第三段。\n\n<blockquote><p>引用</p></blockquote>\n\n<ul><li>无序项</li></ul>\n\n<ol><li>有序项</li></ol>",
    });
    const document = parseMarkup(html);
    const digest = document.querySelector(".bidclub-digest");
    const directChildren = Array.from(digest?.children || []);

    expect(digest).not.toBeNull();
    expect(directChildren.filter((element) => element.tagName === "P")).toHaveLength(3);
    expect(directChildren.filter((element) => /^H[1-3]$/.test(element.tagName))).toHaveLength(1);
    expect(digest?.querySelectorAll("blockquote > p")).toHaveLength(1);
    expect(digest?.querySelectorAll("ul > li, ol > li")).toHaveLength(2);
    expect(digest?.querySelectorAll("p:not(:is(li p, blockquote p))")).toHaveLength(3);
  });

  it("does not emit decorative overview triangles or duplicate digest list marks", () => {
    const overview = renderModel({
      tab: "overview",
      overviewHtml: "<p><strong>观点标题</strong>：观点正文</p>",
    });
    const digest = renderModel({
      tab: "digest",
      digestHtml: "<h3>1. 观点</h3><p>第一段。</p><p>第二段。</p><ul><li>已有列表</li></ul>",
    });

    expect(overview).not.toContain("▸");
    expect(digest).toContain("<h3>1. 观点</h3>");
    expect(digest).toContain("<ul><li>已有列表</li></ul>");
    expect(digest).not.toContain("–");
  });
});
