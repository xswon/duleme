import { marked } from "marked";
import type { BidclubEpisode } from "../types";

export interface BidclubDigest {
  html: string;
  chapters: { id: string; title: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function renderMarkdown(value: unknown): string {
  const markdown = text(value);
  return markdown ? String(marked.parse(markdown)) : "";
}

export function formatTranscript(md: string | null | undefined): string {
  if (!md) return "";
  return md.split("\n").map((line, index, lines) => {
    const trimmed = line.trim();
    const blankBefore = index === 0 || !lines[index - 1].trim();
    const blankAfter = index === lines.length - 1 || !lines[index + 1].trim();
    const looksLikeSpeakerHeading = (
      trimmed
      && trimmed.length <= 15
      && blankBefore
      && blankAfter
      && !/\s/.test(trimmed)
      && !/[。，、！？：；,.!?:;…"')\]》」〉】]$/.test(trimmed)
      && !/^[#*\-[>`~]/.test(trimmed)
    );
    return looksLikeSpeakerHeading ? `**${trimmed}**` : line;
  }).join("\n");
}

export function digestWithChapters(md: string | null | undefined): BidclubDigest {
  const chapters: BidclubDigest["chapters"] = [];
  if (!md) return { html: "", chapters };

  for (const line of md.split("\n")) {
    const match = line.match(/^###\s+(.+)$/);
    if (match) chapters.push({ id: `chapter-${chapters.length + 1}`, title: match[1].trim() });
  }

  let chapterIndex = 0;
  const html = String(marked.parse(md)).replace(
    /<h3([^>]*)>/g,
    (_match, attributes) => `<h3${attributes} id="chapter-${++chapterIndex}">`,
  );
  return { html, chapters };
}

export function mapBidclubEpisodePayload(value: unknown): BidclubEpisode {
  if (!isRecord(value)) throw new Error("BidClub response must be a JSON object");

  const title = text(value.title).trim();
  if (!title) throw new Error("BidClub response is missing an episode title");

  const digest = digestWithChapters(text(value.digest_md));
  const alternateDigest = digestWithChapters(text(value.digest_md_alt));
  const show = isRecord(value.shows) ? value.shows : {};
  const chips = Array.isArray(value.chips)
    ? value.chips.filter((chip): chip is string => typeof chip === "string")
    : [];
  const durationMin = typeof value.duration_min === "number" && Number.isFinite(value.duration_min)
    ? value.duration_min
    : null;

  return {
    title,
    dek: text(value.dek),
    dekAlt: text(value.dek_alt),
    lang: text(value.lang),
    langAlt: text(value.lang_alt),
    tldrHtml: renderMarkdown(value.tldr_md),
    digestHtml: digest.html,
    chapters: digest.chapters,
    transcriptHtml: renderMarkdown(formatTranscript(text(value.transcript_md))),
    tldrAltHtml: renderMarkdown(value.tldr_md_alt),
    digestAltHtml: alternateDigest.html,
    chaptersAlt: alternateDigest.chapters,
    sourceUrl: text(value.source_url),
    sourceLabel: text(value.source_label),
    thumbnailUrl: text(value.thumbnail_url),
    durationMin,
    showName: text(show.name),
    hosts: text(show.hosts),
    chips,
  };
}
