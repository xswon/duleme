import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  Article,
  DetailTab,
  LocalPodcastArtifacts,
  OverviewPanelState,
  OverviewPipelineStage,
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
  pipelineStage?: OverviewPipelineStage;
  pipelinePendingSummary?: boolean;
  pipelineError?: string | null;
  enrichmentLoading: boolean;
  enrichmentError: string | null;
  overviewHtml?: string;
  digestHtml?: string;
  dek?: string;
  transcriptHtml?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  onSummarize: () => void;
  onRegenerateSummary?: () => void;
  onCancelPipeline?: () => void;
  onOpenTranscript?: () => void;
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


function EmptyStateContainer({
  icon,
  title,
  description,
  children,
  tone = "blue",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  tone?: "blue" | "slate";
}) {
  const iconToneClass = tone === "blue"
    ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100"
    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/60";

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-[360px] text-center">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${iconToneClass}`}>
          {icon}
        </div>
        <h3 className="mt-4 text-lg font-semibold leading-7 tracking-tight text-slate-800">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-[320px] text-sm leading-6 text-slate-500">{description}</p>
        {children}
      </div>
    </div>
  );
}

function PrimaryActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold leading-5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function ConfigRequirementRow({
  icon,
  label,
  onConfigure,
}: {
  icon: React.ReactNode;
  label: string;
  onConfigure?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-left">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          {icon}
        </span>
        <span className="text-sm font-semibold leading-5 text-slate-700">{label}</span>
      </div>
      <button
        type="button"
        onClick={onConfigure}
        className="inline-flex items-center gap-1 text-sm font-medium leading-5 text-blue-600 hover:text-blue-700"
      >
        配置
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ConfigRequirementCard({
  icon,
  title,
  description,
  requirements,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  requirements: Array<{
    icon: React.ReactNode;
    label: string;
    onConfigure?: () => void;
  }>;
}) {
  return (
    <EmptyStateContainer
      icon={icon}
      title={title}
      description={description}
      tone="slate"
    >
      <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white text-left shadow-sm">
        {requirements.map((requirement) => (
          <ConfigRequirementRow
            key={requirement.label}
            icon={requirement.icon}
            label={requirement.label}
            onConfigure={requirement.onConfigure}
          />
        ))}
      </div>
    </EmptyStateContainer>
  );
}

function PipelineProgressCard({
  stage,
  autoContinue,
  error,
  transcriptionFailed,
  onCancel,
}: {
  stage: OverviewPipelineStage;
  autoContinue: boolean;
  error?: string | null;
  transcriptionFailed?: boolean;
  onCancel?: () => void;
}) {
  const transcribing = stage === "transcribing";
  const summarizing = stage === "summarizing";
  const failed = stage === "failed";
  const stepOneDone = summarizing || (failed && !transcriptionFailed);
  const stepOneClass = stepOneDone
    ? "bg-emerald-50 text-emerald-600"
    : transcribing
      ? "bg-blue-50 text-blue-600"
      : failed && transcriptionFailed
        ? "bg-rose-50 text-rose-600"
        : "bg-slate-100 text-slate-400";
  const stepTwoClass = summarizing
    ? "bg-blue-50 text-blue-600"
    : failed && !transcriptionFailed
      ? "bg-rose-50 text-rose-600"
      : "bg-slate-100 text-slate-400";

  return (
    <EmptyStateContainer
      icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
      title={failed ? "生成遇到问题" : "正在准备 AI 摘要…"}
      description={autoContinue
        ? "无需切换页面，完成后自动显示。"
        : "逐字稿处理中，完成后即可生成摘要。"}
      tone="blue"
    >
      <div className="mt-5 space-y-4 text-left">
        <div className="flex gap-3">
          <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + stepOneClass}>
            {stepOneDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : "1"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-700">生成逐字稿</p>
              <span className="text-[11px] text-slate-400">
                {stepOneDone ? "已完成" : failed && transcriptionFailed ? "失败" : "进行中"}
              </span>
            </div>
            {transcribing && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + stepTwoClass}>2</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-700">生成 AI 摘要</p>
              <span className="text-[11px] text-slate-400">
                {summarizing ? "进行中" : failed && !transcriptionFailed ? "失败" : "等待"}
              </span>
            </div>
            {summarizing && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-500" />
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-4 text-xs text-rose-600" role="alert">{error}</p>}
      {autoContinue && transcribing && onCancel && (
        <button type="button" onClick={onCancel} className="mt-4 text-xs font-medium text-slate-500 hover:text-slate-700">
          取消
        </button>
      )}
    </EmptyStateContainer>
  );
}

function SummaryActions({
  summary,
  onRegenerate,
  onOpenTranscript,
  articleUrl,
}: {
  summary: string;
  onRegenerate?: () => void;
  onOpenTranscript?: () => void;
  articleUrl?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copySummary = async () => {
    try {
      await navigator.clipboard?.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs">
      <button type="button" onClick={copySummary} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700">
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        {copied ? "已复制" : "复制"}
      </button>
      {onRegenerate && (
        <button type="button" onClick={onRegenerate} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          重新生成
        </button>
      )}
      {articleUrl && (
        <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          原文
        </a>
      )}
      {onOpenTranscript && (
        <button type="button" onClick={onOpenTranscript} className="ml-auto inline-flex items-center gap-1 text-blue-600 hover:text-blue-700">
          查看完整逐字稿
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
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
          <SummaryActions
            summary={p.summary}
            onRegenerate={p.onRegenerateSummary}
            onOpenTranscript={p.article.audioUrl && p.transcriptState === "ready" ? p.onOpenTranscript : undefined}
            articleUrl={p.article.link}
          />
        </section>
      </div>
    );
  }

  if (p.tab === "overview" && !hasPreparedOverview) {
    switch (p.overviewState) {
      case "ready":
        return <LoadingContent />;
      case "needs_all_config":
        return (
          <ConfigRequirementCard
            icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
            title="生成 AI 摘要"
            description="配置所需服务后即可生成。"
            requirements={[
              {
                icon: <AudioLines className="h-4 w-4" aria-hidden="true" />,
                label: "逐字稿服务",
                onConfigure: p.onConfigureTranscription,
              },
              {
                icon: <Bot className="h-4 w-4" aria-hidden="true" />,
                label: "内容整理",
                onConfigure: p.onConfigureAi,
              },
            ]}
          />
        );
      case "needs_transcription_config":
        return (
          <ConfigRequirementCard
            icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
            title="生成 AI 摘要"
            description="配置逐字稿服务后即可生成。"
            requirements={[
              {
                icon: <AudioLines className="h-4 w-4" aria-hidden="true" />,
                label: "逐字稿服务",
                onConfigure: p.onConfigureTranscription,
              },
            ]}
          />
        );
      case "needs_ai_config":
        return (
          <ConfigRequirementCard
            icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
            title="生成 AI 摘要"
            description="配置 AI 模型后即可生成。"
            requirements={[
              {
                icon: <Bot className="h-4 w-4" aria-hidden="true" />,
                label: "内容整理",
                onConfigure: p.onConfigureAi,
              },
            ]}
          />
        );
      case "can_generate":
        return (
          <EmptyStateContainer
            icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
            title="生成 AI 摘要"
            description={p.article.audioUrl
              ? p.transcriptState === "ready"
                ? "基于逐字稿提炼核心观点。"
                : "将自动生成逐字稿并提炼摘要。"
              : "提取核心摘要与关键观点。"}
            tone="blue"
          >
            {p.summaryError && <p className="mt-4 text-xs text-rose-600" role="alert">{p.summaryError}</p>}
            <PrimaryActionButton onClick={p.onSummarize} disabled={p.summarizing}>
              {p.pipelineError ? "重试生成" : p.summarizing ? "正在生成…" : "✨ 生成 AI 摘要"}
            </PrimaryActionButton>
          </EmptyStateContainer>
        );
      case "processing":
      case "transcribing":
        return (
          <PipelineProgressCard
            stage={p.pipelineStage === "idle" || !p.pipelineStage ? "transcribing" : p.pipelineStage}
            autoContinue={Boolean(p.pipelinePendingSummary)}
            error={p.pipelineError || p.summaryError}
            transcriptionFailed={cloudTask?.status === "failed"}
            onCancel={p.onCancelPipeline}
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
        <EmptyStateContainer
          icon={<AudioLines className="h-5 w-5" aria-hidden="true" />}
          title="正在生成逐字稿…"
          description="完成后会自动显示在这里。"
          tone="slate"
        >
          <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
          </div>
        </EmptyStateContainer>
      );
    case "can_generate":
      return (
        <EmptyStateContainer
          icon={<AudioLines className="h-5 w-5" aria-hidden="true" />}
          title="生成逐字稿"
          description="点击开始生成完整逐字稿。"
          tone="slate"
        >
          {(p.localFetchError || cloudTask?.error) && (
            <p className="mt-4 text-xs text-rose-600" role="alert">{p.localFetchError || cloudTask?.error}</p>
          )}
          <PrimaryActionButton onClick={cloudTask?.status === "failed" ? p.onRetryTranscription : p.onStartTranscription}>
            {cloudTask?.status === "failed" ? "重试生成" : "生成逐字稿"}
          </PrimaryActionButton>
        </EmptyStateContainer>
      );
    case "needs_config":
    default:
      return (
        <ConfigRequirementCard
          icon={<AudioLines className="h-5 w-5" aria-hidden="true" />}
          title="生成逐字稿"
          description="配置转录服务后即可生成。"
          requirements={[
            {
              icon: <AudioLines className="h-4 w-4" aria-hidden="true" />,
              label: "逐字稿服务",
              onConfigure: p.onConfigureTranscription,
            },
          ]}
        />
      );
  }

}
