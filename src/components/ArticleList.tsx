import React from "react";
import {
  Star,
  Bookmark,
  Globe,
  CheckCircle,
  Circle,
  Sparkles,
  MoreHorizontal,
  TrendingUp,
  BookOpen,
} from "lucide-react";
import { Article, ViewMode } from "../types";

interface ArticleListProps {
  articles: Article[];
  viewMode: ViewMode;
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
}

export function resolveImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("/api/proxy-image")) return src;
  if (!src.startsWith("http")) return src;
  return `/api/proxy-image?url=${encodeURIComponent(src)}`;
}

interface ArticleThumbnailProps {
  src?: string;
  size?: "small" | "normal";
  feedTitle?: string;
  title?: string;
  feedFavicon?: string;
}

// Sub-component for square thumbnail
const ArticleThumbnail: React.FC<ArticleThumbnailProps> = ({
  src,
  size = "normal",
  feedTitle,
  title,
  feedFavicon,
}) => {
  const [imageSrc, setImageSrc] = React.useState<string | undefined>(() => resolveImageUrl(src));
  const [imgError, setImgError] = React.useState(false);
  const [retryStage, setRetryStage] = React.useState(0);

  React.useEffect(() => {
    setImageSrc(resolveImageUrl(src));
    setImgError(false);
    setRetryStage(0);
  }, [src]);

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

    // Stage 3: All failed -> display fallback cover artwork
    setImgError(true);
  };

  const sizeClasses =
    size === "small"
      ? "w-12 h-12 shrink-0 rounded-xl"
      : "w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 shrink-0 rounded-2xl";

  if (!src || imgError || !imageSrc) {
    const titleText = feedTitle || title || "Podcasts";
    const initial = titleText.charAt(0).toUpperCase();
    const gradients = [
      "from-indigo-600 via-purple-700 to-slate-900",
      "from-slate-800 via-indigo-900 to-blue-950",
      "from-blue-700 via-indigo-800 to-slate-900",
      "from-purple-800 via-slate-800 to-slate-900",
      "from-emerald-800 via-teal-900 to-slate-900",
    ];
    const charCode = titleText.charCodeAt(0) || 0;
    const gradient = gradients[charCode % gradients.length];

    return (
      <div
        className={`${sizeClasses} overflow-hidden bg-gradient-to-br ${gradient} border border-slate-200/40 relative shadow-2xs group-hover:shadow-md transition-all shrink-0 flex flex-col justify-between p-2.5 sm:p-3 text-white select-none`}
      >
        <div className="flex items-center justify-between gap-1">
          {feedFavicon ? (
            <img src={feedFavicon} alt="" className="w-4 h-4 rounded-full bg-white/20 p-0.5 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0">
              {initial}
            </div>
          )}
          <span className="text-[10px] tracking-wide font-semibold opacity-75 uppercase truncate">
            {feedTitle?.slice(0, 8) || "PODCAST"}
          </span>
        </div>
        <div className="my-auto">
          <p className="text-xs font-bold leading-tight line-clamp-2 text-white/95 drop-shadow-xs">
            {title || feedTitle}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} overflow-hidden bg-slate-100 border border-slate-200/60 relative shadow-2xs group-hover:shadow-md transition-shadow shrink-0`}>
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
  viewMode,
  onSelectArticle,
  onToggleStar,
  onToggleRead,
  onSummarizeAI,
}) => {
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center text-slate-500">
        <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4 text-slate-400">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">未找到相关文章</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          暂无符合条件订阅文章。尝试点击右上角刷新图标，或切换筛选条件与订阅源！
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

  // Render 1: LIST VIEW (列表视图 - Compact rows)
  if (viewMode === "list") {
    return (
      <div className="divide-y divide-slate-200 border-b border-slate-200 bg-white transition-colors">
        {articles.map((article) => {
          const dateStr = getRelativeTime(article.pubDate);

          return (
            <div
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors text-xs ${
                article.read ? "opacity-60 font-normal text-slate-600" : "font-semibold text-slate-900"
              }`}
            >
              {/* Star Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(article.id);
                }}
                className={`shrink-0 p-1 rounded hover:bg-slate-200 cursor-pointer ${
                  article.starred ? "text-amber-500" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${article.starred ? "fill-amber-500 text-amber-500" : ""}`} />
              </button>

              {/* Feed Name Badge */}
              <div className="w-28 sm:w-32 shrink-0 flex items-center gap-1.5 min-w-0 text-slate-500">
                {article.feedFavicon ? (
                  <img
                    src={article.feedFavicon}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-3.5 h-3.5 rounded shrink-0 object-contain"
                  />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <span className="truncate text-[11px]">{article.feedTitle}</span>
              </div>

              {/* Cover Thumbnail Image */}
              <ArticleThumbnail
                src={article.thumbnail}
                size="small"
                feedTitle={article.feedTitle}
                title={article.title}
                feedFavicon={article.feedFavicon}
              />

              {/* Article Title & Snippet */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="truncate text-slate-900">{article.title}</span>
                <span className="hidden md:inline truncate text-slate-500 font-normal text-[11px]">
                  — {article.snippet}
                </span>
              </div>

              {/* Date */}
              <span className="shrink-0 text-[11px] text-slate-400">{dateStr}</span>

              {/* Quick Actions on Hover */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRead(article.id);
                  }}
                  title={article.read ? "Mark Unread" : "Mark Read"}
                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-200"
                >
                  {article.read ? <Circle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Common Card Component for Magazine & Main Feed Views matching reference screenshot
  const ArticleCard = ({ article }: { article: Article; key?: React.Key }) => {
    const timeAgoStr = getRelativeTime(article.pubDate);

    return (
      <article
        key={article.id}
        onClick={() => onSelectArticle(article)}
        className={`group flex flex-row gap-4 sm:gap-6 p-2 sm:p-3 rounded-2xl transition-all cursor-pointer hover:bg-slate-100/60 ${
          article.read ? "opacity-75" : "bg-transparent"
        }`}
      >
        {/* Left Square Thumbnail */}
        <ArticleThumbnail
          src={article.thumbnail}
          feedTitle={article.feedTitle}
          title={article.title}
          feedFavicon={article.feedFavicon}
        />

        {/* Right Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div>
            {/* Title */}
            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
              {article.title}
            </h2>

            {/* Feed Title & Author */}
            <div className="text-xs sm:text-sm font-medium text-slate-500 mt-1 mb-1.5 flex items-center gap-1.5">
              <span>{article.feedTitle}</span>
              {article.author && article.author !== article.feedTitle && (
                <span className="text-slate-400 font-normal">• {article.author}</span>
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
            <span className="font-normal text-slate-500 text-xs">{timeAgoStr}</span>

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
                <TrendingUp className="w-4 h-4 text-rose-500/80 hover:text-rose-600" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(article.id);
                }}
                title={article.starred ? "取消收藏" : "收藏"}
                className={`p-1 rounded hover:bg-slate-200/60 transition-colors cursor-pointer ${
                  article.starred ? "text-amber-500" : "text-slate-500 hover:text-slate-800"
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
                className="p-1 rounded hover:bg-slate-200/60 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              >
                {article.read ? (
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectArticle(article);
                }}
                title="更多操作"
                className="p-1 rounded hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  // Render 2: CARD VIEW
  if (viewMode === "card") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {articles.map((article) => {
          const dateStr = getRelativeTime(article.pubDate);

          return (
            <div
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className={`flex flex-col rounded-xl border overflow-hidden cursor-pointer transition-all hover:border-slate-300 hover:shadow-md ${
                article.read ? "bg-slate-50 border-slate-200/80 opacity-80" : "bg-white border-slate-200 shadow-xs"
              }`}
            >
              {/* Image Header */}
              {article.thumbnail ? (
                <div className="h-40 w-full overflow-hidden bg-slate-100 relative">
                  <img
                    src={article.thumbnail}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(article.id);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 text-amber-500 backdrop-blur-xs hover:bg-white shadow-xs"
                  >
                    <Bookmark className={`w-4 h-4 ${article.starred ? "fill-amber-500 text-amber-500" : ""}`} />
                  </button>
                </div>
              ) : (
                <div className="h-14 bg-slate-100 p-3 flex items-center justify-between border-b border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{article.feedTitle}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(article.id);
                    }}
                    className="text-amber-500"
                  >
                    <Bookmark className={`w-4 h-4 ${article.starred ? "fill-amber-500 text-amber-500" : ""}`} />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug mb-1 hover:text-blue-600 transition-colors">
                    {article.title}
                  </h3>

                  <div className="text-xs text-slate-500 mb-2 font-medium">
                    {article.feedTitle}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-3">
                    {article.snippet}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-200">
                  <span className="text-[11px]">{dateStr}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSummarizeAI(article);
                      }}
                      className="p-1 text-purple-600 hover:text-purple-700"
                      title="AI Summary"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRead(article.id);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      {article.read ? <Circle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Render 4: MAGAZINE VIEW
  return (
    <div className="max-w-4xl mx-auto py-4 px-4 sm:px-6 space-y-4">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
};

