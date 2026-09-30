import { describe, expect, it } from "vitest";
import {
  digestWithChapters,
  formatTranscript,
  mapBidclubEpisodePayload,
} from "../src/services/bidclubEpisodeMapper";

describe("BidClub episode mapper", () => {
  it("maps the public episode payload into the existing product model", () => {
    const result = mapBidclubEpisodePayload({
      title: "Episode title",
      dek: "Deck",
      dek_alt: "Alternate deck",
      lang: "ZH",
      lang_alt: "EN",
      tldr_md: "**TLDR**",
      digest_md: "### First\nBody\n\n### Second\nMore",
      transcript_md: "主持人\n\n正文",
      tldr_md_alt: "Alt TLDR",
      digest_md_alt: "### Alternate\nAlt body",
      source_url: "https://example.com/original",
      source_label: "Original",
      thumbnail_url: "https://cdn.example.com/cover.jpg",
      duration_min: 89,
      shows: { name: "LateTalk", hosts: "程曼祺" },
      chips: ["person:程曼祺", 42, "person:田渊栋"],
    });

    expect(result).toMatchObject({
      title: "Episode title",
      dek: "Deck",
      dekAlt: "Alternate deck",
      lang: "ZH",
      langAlt: "EN",
      sourceUrl: "https://example.com/original",
      sourceLabel: "Original",
      thumbnailUrl: "https://cdn.example.com/cover.jpg",
      durationMin: 89,
      showName: "LateTalk",
      hosts: "程曼祺",
      chips: ["person:程曼祺", "person:田渊栋"],
    });
    expect(result.tldrHtml).toContain("<strong>TLDR</strong>");
    expect(result.digestHtml).toContain('id="chapter-1"');
    expect(result.digestHtml).toContain('id="chapter-2"');
    expect(result.chapters).toEqual([
      { id: "chapter-1", title: "First" },
      { id: "chapter-2", title: "Second" },
    ]);
    expect(result.transcriptHtml).toContain("<strong>主持人</strong>");
    expect(result.chaptersAlt).toEqual([{ id: "chapter-1", title: "Alternate" }]);
  });

  it("keeps transcript speaker-heading formatting compatible with the legacy adapter", () => {
    expect(formatTranscript("主持人\n\n正文句子。")).toBe("**主持人**\n\n正文句子。");
    expect(formatTranscript("这是一个正常句子。")).toBe("这是一个正常句子。");
    expect(digestWithChapters("### A\nText").chapters).toEqual([{ id: "chapter-1", title: "A" }]);
  });

  it("rejects malformed payloads instead of exposing a partial episode", () => {
    expect(() => mapBidclubEpisodePayload(null)).toThrow("JSON object");
    expect(() => mapBidclubEpisodePayload([])).toThrow("JSON object");
    expect(() => mapBidclubEpisodePayload({ dek: "missing title" })).toThrow("episode title");
  });
});
