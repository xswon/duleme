import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Article, DetailTab, LocalPodcastArtifacts } from "../types";
import { renderBidclubRichText } from "../services/bidclubRichText";
import { sanitizeHtml } from "../utils/sanitizeHtml";

export interface InsightModel {
  article: Article;
  tab: DetailTab;
  summary: string | null;
  canGenerateSummary: boolean;
  enrichmentLoading: boolean;
  enrichmentError: string | null;
  overviewHtml?: string;
  digestHtml?: string;
  dek?: string;
  transcriptHtml?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  onSummarize: () => void;
  summarizing: boolean;
  summaryError: string | null;
  localArtifacts?: LocalPodcastArtifacts | null;
  localProgress?: number;
  localFetchError?: string | null;
  localRestoring?: boolean;
  onStartTranscription?: () => void;
  onRetryTranscription?: () => void;
  onCreateInsight?: () => void;
  onSeekTranscript?: (seconds: number) => void;
}

function LoadingContent() {
  return (
    <div className="space-y-3 py-4" aria-label="正在加载整理内容">
      <div className="animate-pulse h-4 w-3/4 bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-full bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-5/6 bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-2/3 bg-slate-100 rounded" />
    </div>
  );
}

function EnrichmentUnavailable({ error }: { error: string | null }) {
  return (
    <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm" role="status">
      {error || "暂时无法加载整理内容，正文仍可正常阅读。"}
    </div>
  );
}

function HtmlContent({ html, emptyText, className = "" }: { html?: string; emptyText: string; className?: string }) {
  return html ? (
    <div className={`reader-content ${className}`.trim()} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  ) : (
    <p className="text-sm text-slate-400 py-4">{emptyText}</p>
  );
}

function BidclubRichTextContent({ html, emptyText, className = "" }: { html?: string; emptyText: string; className?: string }) {
  return html ? (
    <div
      className={`reader-content ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: renderBidclubRichText(html) }}
    />
  ) : (
    <p className="text-sm text-slate-400 py-4">{emptyText}</p>
  );
}

function formatMinuteTimestamp(startMs: number): string {
  return `${Math.floor(startMs / 60000)}:00`;
}

export function ArticleInsightTabs({ model: p }: { model: InsightModel }) {
  const [deepSummaryExpanded, setDeepSummaryExpanded] = useState(false);

  useEffect(() => {
    setDeepSummaryExpanded(false);
  }, [p.article.id]);

  const deepSummaryToggle = (
    <button
      type="button"
      className="audio-deep-summary-toggle"
      onClick={() => setDeepSummaryExpanded((expanded) => !expanded)}
      aria-expanded={deepSummaryExpanded}
    >
      <span>{deepSummaryExpanded ? "收起深度精华" : "展开深度精华"}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );

  if (p.tab === "body") {
    return (
      <HtmlContent
        html={p.article.content || (p.article.snippet ? `<p>${p.article.snippet}</p>` : "")}
        emptyText="暂无正文内容"
        className="article-copy"
      />
    );
  }

  if (p.tab === "overview" && p.canGenerateSummary) {
    if (p.summary) {
      return (
        <div className="audio-insight-layout wreader-ai-summary-layout">
          <section className="audio-highlight-body">
            <div className="reader-content bidclub-overview whitespace-pre-wrap">{p.summary}</div>
          </section>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <p className="text-sm text-slate-500 mb-4 max-w-xs">基于文章标题与正文生成核心观点概要</p>
        <button
          onClick={p.onSummarize}
          disabled={p.summarizing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          {p.summarizing ? "正在生成…" : "生成文章概要"}
        </button>
        {p.summaryError && <p className="text-xs text-rose-600 mt-3">{p.summaryError}</p>}
      </div>
    );
  }

  // Remote enrichment state is scoped to enrichment-only tabs. It must never
  // replace the article body or podcast show notes rendered above.
  if (!p.article.audioUrl && p.enrichmentLoading) return <LoadingContent />;
  if (!p.article.audioUrl && p.enrichmentError) return <EnrichmentUnavailable error={p.enrichmentError} />;

  const task = p.article.localPodcast;
  const cloudTask = p.article.transcription;
  const transcriptReady = task?.transcriptionStatus === "completed";
  const localDigest = p.localArtifacts?.digest;
  const action = (kind: "transcript" | "insight") => {
    const status = kind === "transcript" ? cloudTask?.status || "not_started" : task?.insightStatus || "not_started";
    const error = kind === "transcript" ? cloudTask?.error : task?.insightError;
    if (status === "processing") return <div className="py-8 text-center text-sm text-slate-500" role="status">正在生成逐字稿…</div>;
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <p className="mb-4 max-w-sm text-sm text-slate-500">{kind === "transcript" ? "使用已配置的转录服务生成逐字稿。" : "基于已完成的逐字稿生成 AI 摘要。"}</p>
        <button type="button" onClick={kind === "transcript" ? p.onStartTranscription : p.onCreateInsight} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {status === "failed" ? "重试" : kind === "transcript" ? "生成逐字稿" : "使用 AI 整理"}
        </button>
        {(p.localFetchError || error) && <p className="mt-3 text-xs text-rose-600">{p.localFetchError || error}</p>}
      </div>
    );
  };

  const renderList = (value: unknown) => Array.isArray(value) && value.length > 0 ? (
    <ul>{value.map((item, index) => <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul>
  ) : null;

  const renderLocalAiSummary = () => {
    if (!localDigest) return action("insight");
    const oneSentence = localDigest.one_sentence || localDigest.overview;
    const sections = [localDigest.content_map, localDigest.distinctions, localDigest.uncovered].filter(Boolean);
    const chapters = Array.isArray(localDigest.chapters) ? localDigest.chapters : [];
    const deepSummaryAvailable = sections.length > 0 || chapters.length > 0;
    return (
      <div className="audio-insight-layout wreader-ai-summary-layout">
        <section className="audio-highlight-body">
          <div className="reader-content bidclub-overview">
          {oneSentence && <p>{String(oneSentence)}</p>}
          {renderList(localDigest.key_insights)}
          {renderList(localDigest.listen_again)}
          </div>
        </section>
        {deepSummaryAvailable && <>
          {deepSummaryToggle}
          <section className="audio-deep-summary" hidden={!deepSummaryExpanded}>
            <div className="reader-content bidclub-digest">
              {sections.map((section, index) => <section key={index}>{typeof section === "string" ? <p>{section}</p> : Array.isArray(section) ? renderList(section) : <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(section, null, 2)}</pre>}</section>)}
              {chapters.map((chapter: any, index: number) => <section key={index}><h3>{String(chapter.title || `第 ${index + 1} 节`)}</h3><p>{String(chapter.summary || "")}</p></section>)}
            </div>
          </section>
        </>}
        <p className="mt-4 text-xs text-slate-400">来源：本机 NextEcho AI 整理</p>
      </div>
    );
  };

  if (p.tab === "overview" || p.tab === "digest") {
    if (!p.overviewHtml && !p.digestHtml) return transcriptReady ? renderLocalAiSummary() : action("transcript");
    const hasOverview = !!p.overviewHtml?.trim();
    const hasDigest = !!(p.digestHtml?.trim() || p.dek?.trim());
    return (
      <div className="audio-insight-layout wreader-ai-summary-layout">
        {hasOverview && <section className="audio-highlight-body">
          <BidclubRichTextContent html={p.overviewHtml} emptyText="暂无短精华" className="bidclub-overview" />
        </section>}
        {hasDigest && <>
          {deepSummaryToggle}
          <section className="audio-deep-summary" hidden={!deepSummaryExpanded}>
            {p.dek && <p className="text-slate-600 leading-relaxed">{p.dek}</p>}
            {p.digestHtml && <BidclubRichTextContent html={p.digestHtml} emptyText="暂无深度精华" className="bidclub-digest" />}
          </section>
        </>}
        {p.sourceUrl && p.sourceUrl !== p.article.link && (
          <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
            <span>摘要依据：</span>
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
              {p.sourceLabel || p.sourceUrl}
            </a>
          </div>
        )}
      </div>
    );
  }

  if (p.transcriptHtml) return <><HtmlContent html={p.transcriptHtml} emptyText="暂无逐字稿" className="audio-tab-panel audio-transcript-panel" /><p className="reader-attribution">来源：BidClub</p></>;
  if (cloudTask?.segments?.length) return (
    <div className="audio-tab-panel audio-transcript-panel"><p className="reader-attribution">转录服务：阿里云百炼</p>{cloudTask.segments.map((segment, index) => <p key={`${segment.startMs}-${index}`} data-transcript-start-ms={segment.startMs}><button type="button" onClick={() => p.onSeekTranscript?.(segment.startMs / 1000)} className="transcript-time">{formatMinuteTimestamp(segment.startMs)}</button><span>{segment.speaker && <small className="mr-2 text-slate-400">{segment.speaker}</small>}{segment.text}</span></p>)}</div>
  );
  if (p.localArtifacts?.transcript?.length) return (
    <div className="audio-tab-panel audio-transcript-panel">
      <p className="reader-attribution">来源：本机 NextEcho</p>
      {p.localArtifacts.transcript.map((segment, index) => (
        <p key={`${segment.startMs}-${index}`} data-transcript-start-ms={segment.startMs}>
          <button type="button" onClick={() => p.onSeekTranscript?.(segment.startMs / 1000)} className="transcript-time">{formatMinuteTimestamp(segment.startMs)}</button>
          <span>{segment.text}</span>
        </p>
      ))}
    </div>
  );
  return action("transcript");
}
