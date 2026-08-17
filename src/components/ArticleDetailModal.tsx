import React, { useState, useRef, useEffect } from "react";
import {
  X,
  ExternalLink,
  Sparkles,
  Check,
  Paperclip,
  Bookmark,
  Circle,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Headphones,
  Loader2,
} from "lucide-react";
import { Article, BidclubEpisode } from "../types";
import { resolveImageUrl } from "./ArticleList";
import { summarizeArticleWithAI, fetchBidclubEpisode } from "../services/rssService";

interface ArticleDetailModalProps {
  article: Article | null;
  onClose: () => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onNextArticle?: () => void;
  onPrevArticle?: () => void;
}

type DetailTab = "ai" | "digest" | "transcript";

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

export const ArticleDetailModal: React.FC<ArticleDetailModalProps> = ({
  article,
  onClose,
  onToggleStar,
  onToggleRead,
  onNextArticle,
  onPrevArticle,
}) => {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("ai");

  // BidClub episode state (TL;DR + digest + full transcript)
  const [bidclub, setBidclub] = useState<BidclubEpisode | null>(null);
  const [bidclubLoading, setBidclubLoading] = useState(false);
  const [bidclubError, setBidclubError] = useState<string | null>(null);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const bidclubReference = article?.bidclubUrl || article?.bidclubSlug || (article?.link?.includes("bidclub.ai/e/") ? article.link : undefined);
  const isBidclub = !!bidclubReference;

  // Sync state when article changes
  useEffect(() => {
    if (article) {
      setAiSummary(article.aiSummary || null);
      setSummaryError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDetailTab("ai");
    }
  }, [article?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, article?.id]);

  // Fetch full BidClub episode detail (TL;DR + 摘要 + 逐字稿)
  useEffect(() => {
    if (article && isBidclub) {
      let cancelled = false;
      setBidclub(null);
      setBidclubLoading(true);
      setBidclubError(null);
      fetchBidclubEpisode(bidclubReference!)
        .then((data) => {
          if (!cancelled) setBidclub(data);
        })
        .catch((err: any) => {
          if (!cancelled) setBidclubError(err.message || "加载 BidClub 全文失败");
        })
        .finally(() => {
          if (!cancelled) setBidclubLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    setBidclub(null);
    setBidclubLoading(false);
    setBidclubError(null);
  }, [article?.id, bidclubReference]);

  // Keyboard Navigation Support (Esc, Left/Right)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!article) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onPrevArticle) {
        onPrevArticle();
      } else if (e.key === "ArrowRight" && onNextArticle) {
        onNextArticle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [article, onClose, onPrevArticle, onNextArticle]);

  if (!article) return null;

  // Only show the player when the article has a real audio enclosure
  const hasAudio = !!article.audioUrl;
  const hasTranscript = isBidclub; // 目前仅 BidClub 提供逐字稿

  const handleSummarize = async () => {
    if (aiSummary || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const summary = await summarizeArticleWithAI(
        article.title,
        article.content,
        article.snippet
      );
      setAiSummary(summary);
      article.aiSummary = summary; // cache on the article object
    } catch (err: any) {
      setSummaryError(err.message || "AI 总结生成失败，请稍后重试。");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(article.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Audio Play / Pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleRewind30 = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 30);
    }
  };

  const handleForward30 = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.duration || 100,
        audioRef.current.currentTime + 30
      );
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handlePlaybackRateChange = () => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(nextRate);
  };

  const formatAudioTime = (sec: number) => {
    if (isNaN(sec) || sec <= 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Relative publish time string
  const getRelativeTimeStr = (pubDateStr: string) => {
    const date = new Date(pubDateStr);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "刚刚";
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} 天前`;
    return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  };

  const timeAgo = getRelativeTimeStr(article.pubDate);
  const showAuthor = article.author && article.author !== article.feedTitle;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "ai", label: "AI 总结" },
    { key: "digest", label: "摘要" },
    ...(hasTranscript ? [{ key: "transcript" as DetailTab, label: "完整逐字稿" }] : []),
  ];

  const renderLoadingSkeleton = (
    <div className="space-y-3 py-4">
      <div className="animate-pulse h-4 w-3/4 bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-full bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-5/6 bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-2/3 bg-slate-100 rounded" />
    </div>
  );

  const renderTabContent = () => {
    // ---- AI 总结 Tab ----
    if (detailTab === "ai") {
      if (isBidclub) {
        if (bidclubLoading) return renderLoadingSkeleton;
        if (bidclubError) {
          return (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm">
              {bidclubError}
            </div>
          );
        }
        if (bidclub?.tldrHtml) {
          return (
            <div
              className="reader-content"
              dangerouslySetInnerHTML={{ __html: bidclub.tldrHtml }}
            />
          );
        }
        return <p className="text-sm text-slate-400 py-4">暂无 AI 总结内容</p>;
      }

      // 普通文章：按钮触发 + 缓存
      if (aiSummary) {
        return (
          <div className="reader-content whitespace-pre-wrap">{aiSummary}</div>
        );
      }
      return (
        <div className="flex flex-col items-center py-10 text-center">
          <p className="text-sm text-slate-500 mb-4 max-w-xs">
            基于文章标题与正文生成核心观点总结
          </p>
          <button
            onClick={handleSummarize}
            disabled={isSummarizing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {isSummarizing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在生成…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>生成 AI 总结</span>
              </>
            )}
          </button>
          {summaryError && (
            <p className="text-xs text-rose-600 mt-3">{summaryError}</p>
          )}
        </div>
      );
    }

    // ---- 摘要 Tab ----
    if (detailTab === "digest") {
      if (isBidclub) {
        if (bidclubLoading) return renderLoadingSkeleton;
        if (bidclubError) {
          return (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm">
              {bidclubError}
            </div>
          );
        }
        return (
          <div className="space-y-5">
            {bidclub?.dek && (
              <p className="text-slate-600 leading-relaxed">{bidclub.dek}</p>
            )}
            {bidclub?.digestHtml ? (
              <div
                className="reader-content"
                dangerouslySetInnerHTML={{ __html: bidclub.digestHtml }}
              />
            ) : (
              <p className="text-sm text-slate-400">暂无摘要内容</p>
            )}
            {bidclub?.sourceUrl && (
              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                <span>原文来源：</span>
                <a
                  href={bidclub.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  {bidclub.sourceLabel || bidclub.sourceUrl}
                </a>
              </div>
            )}
          </div>
        );
      }
      return (
        <div
          className="reader-content"
          dangerouslySetInnerHTML={{
            __html: article.content || `<p>${article.snippet}</p>`,
          }}
        />
      );
    }

    // ---- 完整逐字稿 Tab ----
    if (bidclubLoading) return renderLoadingSkeleton;
    if (bidclubError) {
      return (
        <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm">
          {bidclubError}
        </div>
      );
    }
    return (
      <div
        className="reader-content"
        dangerouslySetInnerHTML={{
          __html: bidclub?.transcriptHtml || "<p>暂无逐字稿</p>",
        }}
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-hidden animate-fadeIn"
      onClick={onClose}
    >
      {/* Hidden Audio Player Tag */}
      {hasAudio && (
        <audio
          ref={audioRef}
          src={article.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Prev / Next arrows on the sides of the modal */}
      {onPrevArticle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevArticle();
          }}
          className="hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md items-center justify-center shadow-2xl transition-all cursor-pointer hover:scale-105 z-50"
          title="上一篇 (←)"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {onNextArticle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNextArticle();
          }}
          className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md items-center justify-center shadow-2xl transition-all cursor-pointer hover:scale-105 z-50"
          title="下一篇 (→)"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Modal Panel (宽 835px，高度贴满视口仅留边距) */}
      <div
        id="article_dialog_wrapper"
        className="bg-white rounded-2xl shadow-2xl text-slate-900 w-[835px] max-w-[calc(100vw-2rem)] h-[calc(100vh-3rem)] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden transition-all duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top action row (no divider line) */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 text-slate-500">
            <button
              onClick={() => onToggleStar(article.id)}
              className={`p-2 rounded-lg transition-colors cursor-pointer hover:bg-slate-100 ${
                article.starred ? "text-amber-500" : "hover:text-slate-900"
              }`}
              title={article.starred ? "取消收藏" : "收藏文章"}
            >
              <Bookmark className={`w-4 h-4 ${article.starred ? "fill-amber-500" : ""}`} />
            </button>
            <button
              onClick={() => onToggleRead(article.id)}
              className={`p-2 rounded-lg transition-colors cursor-pointer hover:bg-slate-100 ${
                article.read ? "text-slate-400" : "text-blue-600"
              }`}
              title={article.read ? "标记为未读" : "标记为已读"}
            >
              <Circle className={`w-4 h-4 ${!article.read ? "fill-blue-600 text-blue-600" : ""}`} />
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 text-slate-400">
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="复制原文链接"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Paperclip className="w-4 h-4" />}
            </button>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="在浏览器中打开原文"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 scrollbar-thin">
          <div className="w-full max-w-[650px] mx-auto">
            {/* Title & Subtitle */}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
              {article.title}
            </h1>
            <div className="text-xs sm:text-sm text-slate-500 font-medium flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-2">
              <span className="text-slate-700 font-semibold">{article.feedTitle}</span>
              <span>·</span>
              <span>{timeAgo}</span>
              {showAuthor && (
                <>
                  <span>·</span>
                  <span>{article.author}</span>
                </>
              )}
            </div>

            {/* Audio Card (仅真实播客音频) */}
            {hasAudio && (
              <div className="mt-6 bg-[#f2f4f7] rounded-xl overflow-hidden text-slate-800 shadow-xs border border-slate-200/80">
                {/* Banner Artwork & Overlay Player Controls */}
                <div className="relative bg-[#081425] h-[190px] overflow-hidden select-none">
                  <div className="absolute inset-0 overflow-hidden">
                    {article.thumbnail ? (
                      <>
                        <img
                          src={resolveImageUrl(article.thumbnail)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover blur-xl scale-125 opacity-40"
                        />
                        <div className="absolute inset-0 bg-[#081425]/45 mix-blend-multiply" />
                        <img
                          src={resolveImageUrl(article.thumbnail)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full max-w-[280px] object-cover opacity-90"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (article.thumbnail && article.thumbnail.includes("@") && !target.dataset.triedClean) {
                              target.dataset.triedClean = "true";
                              target.src = article.thumbnail.replace(/@[^/]+$/, "");
                            } else if (!target.dataset.triedProxy && article.thumbnail) {
                              target.dataset.triedProxy = "true";
                              target.src = `/api/proxy-image?url=${encodeURIComponent(article.thumbnail)}`;
                            } else {
                              target.style.display = "none";
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-[#3a5d80]/30 mix-blend-color" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-[#3a5d80] flex items-center justify-center">
                        <Headphones className="w-16 h-16 text-slate-300" />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handlePlaybackRateChange}
                    className="absolute right-3 top-3 z-20 min-w-12 rounded-full bg-black/28 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm hover:bg-black/40 hover:text-white transition-colors cursor-pointer"
                    title="调整播放速度"
                  >
                    {playbackRate}x
                  </button>

                  {/* Middle Playback Control Icons */}
                  <div className="absolute inset-x-0 top-1/2 z-10 mx-auto flex -translate-y-1/2 items-center justify-around w-full max-w-xs sm:max-w-sm px-4">
                    <button
                      onClick={handleRewind30}
                      className="text-white/90 hover:text-white hover:scale-110 active:scale-95 transition-transform cursor-pointer p-2 relative flex items-center justify-center"
                      title="倒退 30 秒"
                    >
                      <RotateCcw className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.6]" />
                      <span className="absolute text-[8px] font-bold text-white pt-0.5">30</span>
                    </button>
                    <button
                      onClick={togglePlay}
                      className="w-12 h-12 rounded-full border-[2px] border-white/90 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform cursor-pointer drop-shadow-md bg-black/10 backdrop-blur-xs"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-white stroke-none" />
                      ) : (
                        <Play className="w-5 h-5 fill-white stroke-none ml-0.5" />
                      )}
                    </button>
                    <button
                      onClick={handleForward30}
                      className="text-white/90 hover:text-white hover:scale-110 active:scale-95 transition-transform cursor-pointer p-2 relative flex items-center justify-center"
                      title="快进 30 秒"
                    >
                      <RotateCw className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.6]" />
                      <span className="absolute text-[8px] font-bold text-white pt-0.5">30</span>
                    </button>
                  </div>

                  {/* Time Counter & Progress Bar at Banner Bottom */}
                  <div className="absolute inset-x-0 bottom-0 z-10 w-full">
                    <div className="flex items-center justify-between text-xs font-sans text-white/80 px-3 pb-1">
                      <span>{formatAudioTime(currentTime)}</span>
                      <span>
                        {article.duration || (duration > 0 ? formatAudioTime(duration) : "--:--")}
                      </span>
                    </div>
                    <div className="w-full bg-white/20 h-1 relative cursor-pointer">
                      <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      />
                      <div
                        className="bg-white/80 h-full transition-all"
                        style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cover Image (无音频时占播放器位置；BidClub 用节目真实封面) */}
            {!hasAudio && (article.thumbnail || bidclub?.thumbnailUrl) && (
              <div className="mt-6 rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={resolveImageUrl(article.thumbnail || bidclub?.thumbnailUrl)}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[320px] object-cover"
                  onError={(e) => {
                    const coverSrc = article.thumbnail || bidclub?.thumbnailUrl;
                    const target = e.currentTarget;
                    if (coverSrc && coverSrc.includes("@") && !target.dataset.triedClean) {
                      target.dataset.triedClean = "true";
                      target.src = coverSrc.replace(/@[^/]+$/, "");
                    } else if (!target.dataset.triedProxy && coverSrc) {
                      target.dataset.triedProxy = "true";
                      target.src = `/api/proxy-image?url=${encodeURIComponent(coverSrc)}`;
                    } else {
                      target.closest("div")!.style.display = "none";
                    }
                  }}
                />
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-6 mt-6 text-sm font-semibold">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={`pb-2 border-b-2 transition-all cursor-pointer ${
                    detailTab === tab.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="pt-5">{renderTabContent()}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
