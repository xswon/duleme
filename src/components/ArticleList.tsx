import React from "react";
import { Article } from "../types";
import { resolveArticlePresentation } from "../services/articlePresentation";
import { resolveBackendAssetUrl } from "../services/readerBackend";
import { resolveImageCandidates } from "../services/mediaAssetService";
import { VirtualWindow } from "./VirtualWindow";

function TimelineIcon({ type }: { type: "mail" | "headphones" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {type === "mail" ? <><path d="M4 6.5h16v11H4z" /><path d="m4.5 7 7.5 6 7.5-6" /></> : <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />}
    </svg>
  );
}

interface ArticleListProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  playlistIds?: string[];
  onTogglePlaylist?: (articleId: string) => void;
  olderArticleCount?: number;
  historyWindowDays?: number;
  historyWindowStepDays?: number;
  onShowOlder?: () => void;
  onHideOlder?: () => void;
  selectedArticleId?: string | null;
}

function HistoryWindowControl({
  label,
  position,
  onClick,
}: {
  label: string;
  position: "top" | "bottom";
  onClick: () => void;
}) {
  return (
    <div className={`wreader-timeline-history-control is-${position}`}>
      <button type="button" onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

export function resolveImageUrl(src?: string): string | undefined {
  return resolveBackendAssetUrl("image", src);
}

export function formatDurationMinutes(duration?: string): string | undefined {
  if (!duration) return undefined;
  const trimmed = duration.trim();
  if (!trimmed) return undefined;

  const seconds = /^\d+(?:\.\d+)?$/.test(trimmed)
    ? Number(trimmed)
    : trimmed.split(":").reduce((total, part) => {
      const value = Number(part);
      return Number.isFinite(value) ? total * 60 + value : NaN;
    }, 0);

  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

export interface ArticleThumbnailProps {
  src?: string;
  feedTitle?: string;
  title?: string;
}

// Square thumbnail with light neutral fallback cover
export const ArticleThumbnail: React.FC<ArticleThumbnailProps> = ({
  src,
  feedTitle,
  title,
}) => {
  const [candidateIndex, setCandidateIndex] = React.useState(0);
  const [imgError, setImgError] = React.useState(false);
  const candidates = React.useMemo(() => resolveImageCandidates(src), [src]);
  const imageSrc = candidates[candidateIndex];

  React.useEffect(() => {
    setCandidateIndex(0);
    setImgError(false);
  }, [src]);

  const handleImgError = () => {
    setCandidateIndex((current) => {
      const next = current + 1;
      if (next >= candidates.length) {
        setImgError(true);
        return current;
      }
      return next;
    });
  };

  const sizeClasses = "wreader-story-thumbnail h-12 w-12 shrink-0 rounded-md";

  if (!src || imgError || !imageSrc) {
    const titleText = feedTitle || title || "RSS";
    return (
      <div
        className={`${sizeClasses} wreader-story-thumbnail-fallback relative flex shrink-0 select-none items-center justify-center overflow-hidden`}
      >
        <span>{titleText}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} overflow-hidden bg-slate-100 relative transition-shadow shrink-0`}>
      <img
        src={imageSrc}
        alt=""
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        onError={handleImgError}
      />
    </div>
  );
};


function SourceAvatar({
  src,
  title,
}: {
  src?: string;
  title: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const imageSrc = resolveImageUrl(src);
  const fallback = Array.from(title.trim())[0]?.toUpperCase() || "R";

  return (
    <span className="wreader-source-avatar-shell">
      {imageSrc && !failed ? (
        <img
          src={imageSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="wreader-source-avatar"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="wreader-source-avatar wreader-source-avatar-fallback" aria-hidden="true">{fallback}</span>
      )}
    </span>
  );
}

function decodeTimelineEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeTimelineText(value: string): string {
  return decodeTimelineEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function isUsefulTimelineSegment(segment: string, title: string): boolean {
  const clean = segment.trim();
  if (!clean) return false;
  const comparable = normalizeComparableText(clean);
  const titleComparable = normalizeComparableText(title);
  if (!comparable) return false;
  if (titleComparable && (comparable === titleComparable || titleComparable.startsWith(comparable) || comparable.startsWith(titleComparable))) {
    return false;
  }
  if (/^(?:read more|continue reading|learn more|subscribe|sign up|view online|listen now|show notes)\b/i.test(clean)) {
    return false;
  }
  return clean.length >= 18 || /[\u3400-\u9fff]/.test(clean) && clean.length >= 10;
}

export function resolveTimelineSummary(article: Article): string {
  const body = normalizeTimelineText(article.content || "");
  const snippet = normalizeTimelineText(article.snippet || "");
  const source = body || snippet;
  if (!source) return "";

  const paragraphs = source
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => isUsefulTimelineSegment(part, article.title));

  const sentencePool = (paragraphs.length ? paragraphs : [source])
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？!?])\s*|(?<=[.!?])\s+(?=[A-Z0-9“"'])/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => isUsefulTimelineSegment(sentence, article.title));

  const pieces = sentencePool.length ? sentencePool : paragraphs.length ? paragraphs : [source];
  let summary = "";
  const preferredLength = /[\u3400-\u9fff]/.test(source) ? 90 : 180;
  const maxLength = /[\u3400-\u9fff]/.test(source) ? 150 : 280;

  for (const piece of pieces) {
    const candidate = summary ? `${summary} ${piece}` : piece;
    if (candidate.length > maxLength && summary.length >= preferredLength) break;
    summary = candidate.slice(0, maxLength).trim();
    if (summary.length >= preferredLength) break;
  }

  return summary || source.slice(0, maxLength).trim();
}

export function formatArticleRelativeTime(pubDate: string) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export const ArticleList: React.FC<ArticleListProps> = ({
  articles,
  onSelectArticle,
  onToggleStar: _onToggleStar,
  onToggleRead: _onToggleRead,
  onSummarizeAI: _onSummarizeAI,
  playlistIds: _playlistIds = [],
  onTogglePlaylist: _onTogglePlaylist,
  olderArticleCount = 0,
  historyWindowDays = 30,
  historyWindowStepDays = 30,
  onShowOlder,
  onHideOlder,
  selectedArticleId,
}) => {
  const hasOlderArticles = olderArticleCount > 0;
  const isExpandedHistory = historyWindowDays > 30;
  const nextWindowDays = historyWindowDays + historyWindowStepDays;

  if (articles.length === 0) {
    return (
      <div className="wreader-timeline-empty flex flex-col items-center justify-center py-20 px-4 text-center text-slate-500">
        <div className="wreader-timeline-empty-icon">
          <TimelineIcon type="mail" />
        </div>
        {hasOlderArticles ? (
          <>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              最近 30 天没有内容，还有 {olderArticleCount} 篇更早内容
            </h3>
            {onShowOlder && (
              <button
                type="button"
                onClick={onShowOlder}
                className="mt-3 wreader-btn wreader-btn-ghost"
              >
                查看最近 {nextWindowDays} 天
              </button>
            )}
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">未找到相关文章</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              暂无符合条件的订阅文章。尝试点击右上角刷新图标，或切换筛选条件与订阅源。
            </p>
          </>
        )}
      </div>
    );
  }

  // Text-first timeline: keep the list focused on source, title, and summary.
  return (
    <div className="wreader-article-list px-2 py-2">
      {isExpandedHistory && onHideOlder && (
        <HistoryWindowControl
          label="收起至最近 30 天"
          position="top"
          onClick={onHideOlder}
        />
      )}
      <VirtualWindow
        count={articles.length}
        estimateSize={126}
        gap={6}
        overscan={10}
        className="wreader-article-virtual-window"
        getItemKey={(index) => articles[index].id}
        renderItem={(index) => {
          const article = articles[index];
          const timeAgoStr = formatArticleRelativeTime(article.pubDate);
          const presentation = resolveArticlePresentation(article);
          const audioDurationLabel = presentation.capabilities.hasAudio
            ? formatDurationMinutes(article.duration)
            : undefined;
          const timelineSummary = resolveTimelineSummary(article);

          return (
            <article
              data-article-id={article.id}
              onClick={() => onSelectArticle(article)}
              className={`wreader-story-row group cursor-pointer ${
                selectedArticleId === article.id ? "is-selected" : ""
              } ${
                article.read ? "is-read" : "is-unread"
              }`}
            >
              <div className="wreader-story-copy">
                <div className="wreader-story-source-meta">
                  <SourceAvatar src={article.feedFavicon} title={article.feedTitle} />
                  <div className="wreader-story-meta-primary">
                    <span className="wreader-story-unread-slot">
                      {!article.read && <span className="wreader-unread-dot" aria-label="未读" />}
                    </span>
                    <span className="wreader-story-feed" title={article.feedTitle}>{article.feedTitle}</span>
                  </div>
                  {timeAgoStr && <time className="wreader-story-time">{timeAgoStr}</time>}
                </div>

                <div className="wreader-story-body">
                  <h2 className="line-clamp-2">{article.title}</h2>
                  {timelineSummary && <p className="line-clamp-2">{timelineSummary}</p>}
                  {audioDurationLabel && (
                    <div className="wreader-story-duration-row">
                      <span className="wreader-story-duration" aria-label={`播客时长 ${audioDurationLabel}`}>
                        <TimelineIcon type="headphones" />
                        <span>{audioDurationLabel}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        }}
      />
      {hasOlderArticles && onShowOlder && (
        <HistoryWindowControl
          label="继续加载 30 天"
          position="bottom"
          onClick={onShowOlder}
        />
      )}
    </div>
  );
};
