import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Article,
  DetailTab,
  LocalPodcastArtifacts,
  OverviewPanelState,
  TranscriptPanelState,
} from "../types";
import { renderBidclubRichText } from "../services/bidclubRichText";
import { sanitizeHtml } from "../utils/sanitizeHtml";

export interface InsightModel {
  article: Article;
  tab: DetailTab;
  summary: string | null;
  overviewState: OverviewPanelState;
  transcriptState?: TranscriptPanelState;
  enrichmentLoading: boolean;
  enrichmentError: string | null;
  overviewHtml?: string;
  digestHtml?: string;
  dek?: string;
  transcriptHtml?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  onSummarize: () => void;
  onConfigureAi?: () => void;
  onConfigureTranscription?: () => void;
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

function InsightEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  primary = false,
  progress,
  error,
  disabled = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  primary?: boolean;
  progress?: number;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="py-7">
      <div className="max-w-md rounded-xl border border-slate-200/80 bg-slate-50/60 px-5 py-4">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        {typeof progress === "number" && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-label={`转录进度 ${Math.round(progress)}%`}>
            <div className="h-full rounded-full bg-slate-400 transition-[width]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        )}
        {error && <p className="mt-3 text-xs text-rose-600" role="alert">{error}</p>}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className={primary
              ? "mt-4 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              : "mt-4 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
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

  const cloudTask = p.article.transcription;
  const localDigest = p.localArtifacts?.digest;
  const hasPreparedOverview = Boolean(
    p.overviewHtml?.trim() || p.digestHtml?.trim() || localDigest
  );

  if (p.tab === "overview" && p.summary) {
    return (
      <div className="audio-insight-layout wreader-ai-summary-layout">
        <section className="audio-highlight-body">
          <div className="reader-content bidclub-overview whitespace-pre-wrap">{p.summary}</div>
        </section>
      </div>
    );
  }

  if (p.tab === "overview" && !hasPreparedOverview) {
    switch (p.overviewState) {
      case "ready":
        return <LoadingContent />;
      case "can_generate":
        return (
          <InsightEmptyState
            title={p.article.audioUrl ? "可以生成 AI 摘要了" : "生成 AI 摘要"}
            description={p.article.audioUrl
              ? "将基于完整逐字稿提取核心内容，而不是只根据节目介绍。"
              : "提取核心摘要、关键观点和阅读时间。"}
            actionLabel={p.summarizing ? "正在生成…" : "生成 AI 摘要"}
            onAction={p.onSummarize}
            disabled={p.summarizing}
            error={p.summaryError}
            primary
          />
        );
      case "needs_ai_config":
        return (
          <InsightEmptyState
            title={p.article.audioUrl ? "逐字稿已就绪" : "使用 AI 提炼这篇文章"}
            description={p.article.audioUrl
              ? "配置内容整理模型后，即可基于完整逐字稿生成摘要。"
              : "配置内容整理模型后，可以生成核心摘要和关键观点。"}
            actionLabel="配置模型"
            onAction={p.onConfigureAi}
          />
        );
      case "needs_transcript":
        return (
          <InsightEmptyState
            title="先生成逐字稿"
            description="AI 摘要会基于完整节目内容生成，而不是只根据节目介绍。"
            actionLabel={cloudTask?.status === "failed" ? "重试生成" : "生成逐字稿"}
            onAction={cloudTask?.status === "failed" ? p.onRetryTranscription : p.onStartTranscription}
            error={p.localFetchError || cloudTask?.error}
            primary
          />
        );
      case "transcribing":
        return (
          <InsightEmptyState
            title="正在生成逐字稿…"
            description="完成后即可基于完整节目内容生成 AI 摘要。"
            progress={p.localProgress}
          />
        );
      case "needs_transcription_config":
        return (
          <InsightEmptyState
            title="需要先启用逐字稿"
            description="配置转录服务并生成逐字稿后，才能基于完整节目内容生成摘要。"
            actionLabel="配置逐字稿"
            onAction={p.onConfigureTranscription}
          />
        );
    }
  }

  // Remote enrichment state is scoped to enrichment-only tabs. It must never
  // replace the article body or podcast show notes rendered above.
  if (!p.article.audioUrl && p.enrichmentLoading) return <LoadingContent />;
  if (!p.article.audioUrl && p.enrichmentError) return <EnrichmentUnavailable error={p.enrichmentError} />;


  const renderList = (value: unknown) => Array.isArray(value) && value.length > 0 ? (
    <ul>{value.map((item, index) => <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul>
  ) : null;

  const renderLocalAiSummary = () => {
    if (!localDigest) return <LoadingContent />;
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
    if (!p.overviewHtml && !p.digestHtml) return renderLocalAiSummary();
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
  switch (p.transcriptState) {
    case "ready":
      return <LoadingContent />;
    case "generating":
      return (
        <InsightEmptyState
          title="正在生成逐字稿…"
          description="完成后会自动显示在这里。"
          progress={p.localProgress}
        />
      );
    case "can_generate":
      return (
        <InsightEmptyState
          title="生成逐字稿"
          description="音频只会在你主动操作后开始处理。"
          actionLabel={cloudTask?.status === "failed" ? "重试生成" : "生成逐字稿"}
          onAction={cloudTask?.status === "failed" ? p.onRetryTranscription : p.onStartTranscription}
          error={p.localFetchError || cloudTask?.error}
          primary
        />
      );
    case "needs_config":
    default:
      return (
        <InsightEmptyState
          title="还没有逐字稿"
          description="配置转录方式后，即可按需生成完整逐字稿。"
          actionLabel="配置逐字稿"
          onAction={p.onConfigureTranscription}
        />
      );
  }
}
