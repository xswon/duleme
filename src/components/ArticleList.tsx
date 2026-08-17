import React from "react";
import { Bookmark, Sparkles, CheckCircle, Circle, BookOpen, Headphones } from "lucide-react";
import { Article } from "../types";
import { fetchBidclubEpisode } from "../services/rssService";

interface ArticleListProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  onResolveThumbnail?: (articleId: string, url: string) => void;
}

export function resolveImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("/api/proxy-image")) return src;
  if (!src.startsWith("http")) return src;
  return `/api/proxy-image?url=${encodeURIComponent(src)}`;
}

interface ArticleThumbnailProps {
  src?: string;
  feedTitle?: string;
  title?: string;
  feedFavicon?: string;
  articleId?: string;
  link?: string;
  bidclubUrl?: string;
  bidclubSlug?: string;
  onResolveThumbnail?: (articleId: string, url: string) => void;
}

// Track in-flight lazy cover fetches to avoid duplicate requests
const pendingCoverFetch = new Set<string>();

// Square thumbnail with light neutral fallback cover
const ArticleThumbnail: React.FC<ArticleThumbnailProps> = ({
  src,
  feedTitle,
  title,
  feedFavicon,
  articleId,
  link,
  bidclubUrl,
  bidclubSlug,
  onResolveThumbnail,
}) => {
  const [imageSrc, setImageSrc] = React.useState<string | undefined>(() => resolveImageUrl(src));
  const [imgError, setImgError] = React.useState(false);
  const [retryStage, setRetryStage] = React.useState(0);

  React.useEffect(() => {
    setImageSrc(resolveImageUrl(src));
    setImgError(false);
    setRetryStage(0);
  }, [src]);

  // Lazy-fetch real covers for BidClub episodes (feed entries carry no image fields)
  React.useEffect(() => {
    const reference = bidclubUrl || bidclubSlug || (link?.includes("bidclub.ai/e/") ? link : undefined);
    if (src || !reference || !articleId || !onResolveThumbnail) return;
    if (pendingCoverFetch.has(articleId)) return;
    pendingCoverFetch.add(articleId);
    fetchBidclubEpisode(reference)
      .then((d) => {
        if (d.thumbnailUrl) onResolveThumbnail(articleId, d.thumbnailUrl);
      })
      .catch(() => {})
      .finally(() => pendingCoverFetch.delete(articleId));
  }, [src, link, bidclubUrl, bidclubSlug, articleId, onResolveThumbnail]);

  const handleImgError = () => {
    if (!src) {
      setImgError(true);
      return;
    }

    if (retryStage === 0) {
      // Stage 1: Try stripping @small or @suffix if present
      if (src.includes("@")) {
        const cleanSrc = src.replace(/@[^/]+$/, "");
        if (cleanSrc !== src) {
          setImageSrc(resolveImageUrl(cleanSrc));
          setRetryStage(1);
          return;
        }
      }
      // Stage 1b: Try raw unproxied URL
      setImageSrc(src);
      setRetryStage(2);
      return;
    }

    if (retryStage === 1) {
      // Stage 2: Try raw unproxied URL
      setImageSrc(src);
      setRetryStage(2);
      return;
    }

    // Stage 3: All failed -> display fallback cover
    setImgError(true);
  };

  const sizeClasses = "w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 shrink-0 rounded-2xl";

  if (!src || imgError || !imageSrc) {
    const titleText = feedTitle || title || "RSS";
    const initial = titleText.charAt(0).toUpperCase();

    return (
      <div
        className={`${sizeClasses} overflow-hidden bg-slate-100 relative transition-all shrink-0 flex flex-col justify-between p-2.5 sm:p-3 text-slate-500 select-none`}
      >
        <div className="flex items-center gap-1.5">
          {feedFavicon ? (
            <img src={feedFavicon} alt="" className="w-4 h-4 rounded-full shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold shrink-0">
              {initial}
            </div>
          )}
          <span className="text-[10px] tracking-wide font-medium text-slate-400 truncate">
            {feedTitle || ""}
          </span>
        </div>
        <div className="my-auto">
          <p className="text-xs font-semibold leading-tight line-clamp-3 text-slate-500">
            {title || feedTitle}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} overflow-hidden bg-slate-100 relative transition-shadow shrink-0`}>
      <img
        src={imageSrc}
        alt=""
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={handleImgError}
      />
    </div>
  );
};

export const ArticleList: React.FC<ArticleListProps> = ({
  articles,
  onSelectArticle,
  onToggleStar,
  onToggleRead,
  onSummarizeAI,
  onResolveThumbnail,
}) => {
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center text-slate-500">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">未找到相关文章</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          暂无符合条件的订阅文章。尝试点击右上角刷新图标，或切换筛选条件与订阅源。
        </p>
      </div>
    );
  }

  // Helper for relative time string (e.g. 9h, 12h, 1d, 4d)
  const getRelativeTime = (pubDate: string) => {
    const date = new Date(pubDate);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHour < 1) {
      const diffMin = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${diffMin}m`;
    }
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // MAGAZINE VIEW (单一视图)
  return (
    <div className="max-w-4xl mx-auto py-4 px-4 sm:px-6 space-y-2">
      {articles.map((article) => {
        const timeAgoStr = getRelativeTime(article.pubDate);

        return (
          <article
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className={`group flex flex-row gap-4 sm:gap-6 p-2 sm:p-3 rounded-2xl transition-all cursor-pointer hover:bg-slate-100/60 ${
              article.read ? "opacity-70" : "bg-transparent"
            }`}
          >
            {/* Left Square Thumbnail */}
            <ArticleThumbnail
              src={article.thumbnail}
              feedTitle={article.feedTitle}
              title={article.title}
              feedFavicon={article.feedFavicon}
              articleId={article.id}
              link={article.link}
              bidclubUrl={article.bidclubUrl}
              bidclubSlug={article.bidclubSlug}
              onResolveThumbnail={onResolveThumbnail}
            />

            {/* Right Content */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
              <div>
                {/* Title */}
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                  <span className="inline">
                    {article.title}
                    {article.audioUrl && (
                      <span className="inline-flex items-center whitespace-nowrap ml-1.5 align-text-bottom text-slate-400" aria-label="音频文章">
                        <Headphones className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2} />
                      </span>
                    )}
                  </span>
                </h2>

                {/* Feed Title & Author */}
                <div className="text-xs sm:text-sm font-medium text-slate-500 mt-1 mb-1.5 flex items-center gap-1.5">
                  <span>{article.feedTitle}</span>
                  {article.author && article.author !== article.feedTitle && (
                    <span className="text-slate-400 font-normal">· {article.author}</span>
                  )}
                </div>

                {/* Snippet */}
                <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
                  {article.snippet}
                </p>
              </div>

              {/* Bottom Action Row */}
              <div className="flex items-center justify-between text-xs text-slate-400 mt-2.5">
                {/* Left: Relative Timestamp */}
                <span className="font-normal text-slate-400 text-xs">{timeAgoStr}</span>

                {/* Right: Icon Buttons */}
                <div className="flex items-center gap-3 text-slate-500">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSummarizeAI(article);
                    }}
                    title="AI 总结"
                    className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-purple-600 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(article.id);
                    }}
                    title={article.starred ? "取消收藏" : "收藏"}
                    className={`p-1 rounded hover:bg-slate-200/60 transition-colors cursor-pointer ${
                      article.starred ? "text-amber-500" : "text-slate-400 hover:text-slate-800"
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${article.starred ? "fill-amber-500 text-amber-500" : ""}`} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRead(article.id);
                    }}
                    title={article.read ? "标记未读" : "标记已读"}
                    className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    {article.read ? (
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};
