import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Star,
  ExternalLink,
  Sparkles,
  Check,
  Globe,
  Clock,
  User,
  Paperclip,
  Bookmark,
  Tag,
  Circle,
  Coffee,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  CloudDownload,
  ListMusic,
  Headphones,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Article } from "../types";
import { resolveImageUrl } from "./ArticleList";
import { summarizeArticleWithAI } from "../services/rssService";

interface ArticleDetailModalProps {
  article: Article | null;
  onClose: () => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onNextArticle?: () => void;
  onPrevArticle?: () => void;
}

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
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"desc" | "transcript" | "topics" | "article">("desc");

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync state when article changes
  useEffect(() => {
    if (article) {
      setAiSummary(article.aiSummary || null);
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveTab("desc");
    }
  }, [article?.id]);

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

  // Determine if this is a podcast / audio article
  const audioSource = article.audioUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
  const isPodcast = !!article.audioUrl || article.feedTitle?.includes("串门") || article.feedTitle?.includes("101") || article.feedTitle?.includes("42") || article.feedTitle?.includes("FM") || article.title?.includes("#");

  const handleSummarize = async () => {
    if (aiSummary) return;
    setIsSummarizing(true);
    try {
      const summary = await summarizeArticleWithAI(
        article.title,
        article.content,
        article.snippet
      );
      setAiSummary(summary);
      article.aiSummary = summary;
    } catch (err: any) {
      alert(err.message || "Failed to generate summary with AI.");
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

  const handleRewind10 = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
    }
  };

  const handleForward10 = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.duration || 100,
        audioRef.current.currentTime + 10
      );
    }
  };

  const handleSpeedChange = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackRate(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
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
    if (diffHours < 1) return "刚发布";
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const timeAgo = getRelativeTimeStr(article.pubDate);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-hidden animate-fadeIn">
      {/* Hidden Audio Player Tag */}
      <audio
        ref={audioRef}
        src={audioSource}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Left Navigation Arrow */}
      {onPrevArticle && (
        <button
          onClick={onPrevArticle}
          className="hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md border border-white/20 items-center justify-center shadow-2xl transition-all cursor-pointer hover:scale-105 z-50"
          title="上一篇文章 (Left Arrow)"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {/* Right Navigation Arrow */}
      {onNextArticle && (
        <button
          onClick={onNextArticle}
          className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md border border-white/20 items-center justify-center shadow-2xl transition-all cursor-pointer hover:scale-105 z-50"
          title="下一篇文章 (Right Arrow)"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Main Inoreader Styled Article Reader Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl text-slate-900 flex flex-col max-h-[92vh] w-full max-w-3xl overflow-hidden transition-all duration-200 relative">
        {/* Top Header Action Bar matching Inoreader reference */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-white shrink-0">
          {/* Action Icon Group Left */}
          <div className="flex items-center gap-1 sm:gap-2 text-slate-500">
            {/* Saved / Star Bookmark */}
            <button
              onClick={() => onToggleStar(article.id)}
              className={`p-2 rounded-lg transition-colors cursor-pointer hover:bg-slate-100 ${
                article.starred ? "text-amber-500 fill-amber-500" : "hover:text-slate-900"
              }`}
              title={article.starred ? "取消收藏" : "收藏文章"}
            >
              <Bookmark className={`w-4 h-4 ${article.starred ? "fill-amber-500" : ""}`} />
            </button>

            {/* Tag / Category */}
            <button
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="标签与分类"
            >
              <Tag className="w-4 h-4" />
            </button>

            {/* Read / Unread Circle */}
            <button
              onClick={() => onToggleRead(article.id)}
              className={`p-2 rounded-lg transition-colors cursor-pointer hover:bg-slate-100 ${
                article.read ? "text-slate-400" : "text-blue-600 font-bold"
              }`}
              title={article.read ? "标记为未读" : "标记为已读"}
            >
              <Circle className={`w-4 h-4 ${!article.read ? "fill-blue-600 text-blue-600" : ""}`} />
            </button>

            {/* AI Sparkles Summarize Button */}
            <button
              onClick={handleSummarize}
              disabled={isSummarizing}
              className={`p-2 rounded-lg transition-colors cursor-pointer hover:bg-slate-100 ${
                aiSummary ? "text-purple-600" : "text-slate-500 hover:text-purple-600"
              }`}
              title="一键 AI 总结"
            >
              <Sparkles className={`w-4 h-4 ${isSummarizing ? "animate-spin text-purple-600" : ""}`} />
            </button>

            {/* Coffee / Podcast Toggle */}
            <button
              className={`p-2 rounded-lg transition-colors cursor-pointer hover:bg-slate-100 ${
                isPodcast ? "text-indigo-600" : "text-slate-500"
              }`}
              title="播客收听模式"
            >
              <Coffee className="w-4 h-4" />
            </button>

            {/* More Options (...) */}
            <button
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="更多操作"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Action Icon Group Right */}
          <div className="flex items-center gap-1 sm:gap-2 text-slate-400">
            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="复制原文链接"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Paperclip className="w-4 h-4" />}
            </button>

            {/* External Link */}
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="在浏览器中打开原文"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Reader Content Body */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-6 scrollbar-thin">
          {/* Article Header (Title & Subtitle Meta) */}
          <div className="space-y-2">
            {/* Article Title */}
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-snug tracking-tight">
              {article.title}
            </h1>

            {/* Subtitle Meta Line matching Image 1: "跨国串门儿计划 ˅ · 来自 yikai ˅ · 13h" */}
            <div className="text-xs sm:text-sm text-slate-500 font-medium flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-slate-700 font-semibold cursor-pointer hover:underline">
                {article.feedTitle}
              </span>
              <span>•</span>
              <span>来自 <strong className="text-slate-700 font-normal">{article.author || article.feedTitle}</strong></span>
              <span>•</span>
              <span>{timeAgo}</span>
            </div>
          </div>

          {/* Podcast Player Section (If podcast episode) */}
          {isPodcast && (
            <div className="space-y-4">
              {/* Inoreader Audio Player Card matching Image 1 */}
              <div className="bg-[#1b1e2e] text-white p-5 sm:p-6 rounded-2xl shadow-xl border border-indigo-900/40 relative overflow-hidden">
                {/* Player Top Controls */}
                <div className="flex items-center justify-between text-slate-400 mb-4 text-xs font-semibold">
                  <button className="p-1.5 hover:text-white transition-colors cursor-pointer" title="下载音频">
                    <CloudDownload className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleSpeedChange}
                    className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
                    title="播放倍速"
                  >
                    {playbackRate}x
                  </button>

                  <button className="p-1.5 hover:text-white transition-colors cursor-pointer" title="播放列表">
                    <ListMusic className="w-4 h-4" />
                  </button>
                </div>

                {/* Center Artwork & Play Controls */}
                <div className="flex items-center justify-center gap-6 sm:gap-10 my-4">
                  {/* Rewind 10s */}
                  <button
                    onClick={handleRewind10}
                    className="p-3 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer relative group"
                    title="倒退 10 秒"
                  >
                    <RotateCcw className="w-6 h-6" />
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400">10</span>
                  </button>

                  {/* Main Artwork Circle + Play/Pause Button */}
                  <div className="relative group flex items-center justify-center">
                    <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-900 flex items-center justify-center shadow-2xl relative overflow-hidden border-4 border-indigo-900/50">
                      {article.thumbnail ? (
                        <img
                          src={resolveImageUrl(article.thumbnail)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-80"
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
                      ) : (
                        <Headphones className="w-16 h-16 text-white/40" />
                      )}
                      {/* Central Overlay Play Button */}
                      <button
                        onClick={togglePlay}
                        className="absolute w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white text-indigo-900 shadow-2xl flex items-center justify-center hover:scale-105 transition-all cursor-pointer"
                      >
                        {isPlaying ? (
                          <Pause className="w-7 h-7 fill-indigo-900" />
                        ) : (
                          <Play className="w-7 h-7 fill-indigo-900 ml-1" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Forward 10s */}
                  <button
                    onClick={handleForward10}
                    className="p-3 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer relative group"
                    title="快进 10 秒"
                  >
                    <RotateCw className="w-6 h-6" />
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400">10</span>
                  </button>
                </div>

                {/* Progress Slider Bar */}
                <div className="space-y-1.5 mt-4">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-700/60 rounded-lg appearance-none cursor-pointer accent-indigo-400 hover:accent-indigo-300"
                  />
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatAudioTime(currentTime)}</span>
                    <span>{article.duration || (duration > 0 ? formatAudioTime(duration) : "89:08")}</span>
                  </div>
                </div>

                {/* Episode Title inside Player */}
                <div className="mt-3 text-center">
                  <p className="text-xs sm:text-sm font-bold text-slate-200 truncate">
                    {article.title}
                  </p>
                </div>
              </div>

              {/* Podcast Tab Selector matching Image 1: 描述 | 转写 | 话题 | 文章 | 现在升级 */}
              <div className="flex items-center gap-4 sm:gap-8 border-b border-slate-200 text-xs sm:text-sm font-semibold pt-1">
                <button
                  onClick={() => setActiveTab("desc")}
                  className={`pb-2.5 border-b-2 transition-all cursor-pointer ${
                    activeTab === "desc"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  描述
                </button>
                <button
                  onClick={() => setActiveTab("transcript")}
                  className={`pb-2.5 border-b-2 transition-all cursor-pointer ${
                    activeTab === "transcript"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  转写
                </button>
                <button
                  onClick={() => setActiveTab("topics")}
                  className={`pb-2.5 border-b-2 transition-all cursor-pointer ${
                    activeTab === "topics"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  话题
                </button>
                <button
                  onClick={() => setActiveTab("article")}
                  className={`pb-2.5 border-b-2 transition-all cursor-pointer ${
                    activeTab === "article"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  文章
                </button>
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200/80 font-medium flex items-center gap-1 cursor-pointer hover:bg-amber-200">
                  🛡️ 现在升级
                </span>
              </div>
            </div>
          )}

          {/* AI Summary Box if Generated */}
          {aiSummary && (
            <div className="p-4 rounded-xl bg-purple-50/90 border border-purple-200 text-purple-950 text-sm space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-purple-800 border-b border-purple-200/60 pb-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Gemini AI 核心观点与总结</span>
              </div>
              <div className="prose prose-purple max-w-none text-purple-950 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {aiSummary}
              </div>
            </div>
          )}

          {/* Transcript Tab View */}
          {isPodcast && activeTab === "transcript" && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-700">
              <div className="font-bold text-slate-900 pb-1 border-b border-slate-200 flex items-center justify-between">
                <span>🎙️ AI 语音转写文本 preview</span>
                <span className="text-[10px] text-slate-400">自动对齐音频</span>
              </div>
              <div className="space-y-2 leading-relaxed">
                <p><span className="font-mono text-blue-600 font-semibold">[00:01:20]</span> 本期节目由 Founders Podcast 主持人 David Senra 主讲，深入拆解了喜马拉雅资本创始人李录的投资生涯与思想体系。</p>
                <p><span className="font-mono text-blue-600 font-semibold">[00:05:42]</span> 李录是查理·芒格亲自托付家族资产的投资人，被誉为“中国的巴菲特”。</p>
                <p><span className="font-mono text-blue-600 font-semibold">[00:12:15]</span> David Senra 把能找到的所有李录演讲和访谈视频转成文字稿，按年份排序打印出来装订成自传，反复研读。</p>
              </div>
            </div>
          )}

          {/* Topics Tab View */}
          {isPodcast && activeTab === "topics" && (
            <div className="flex flex-wrap gap-2 p-2">
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"># 喜马拉雅资本</span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"># 查理芒格</span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"># 价值投资</span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"># 巴菲特</span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"># 商业思考</span>
            </div>
          )}

          {/* Article Main Body Content (Description or Article) */}
          {(!isPodcast || activeTab === "desc" || activeTab === "article") && (
            <div
              className="prose max-w-none text-slate-800 text-base sm:text-lg leading-relaxed sm:leading-loose space-y-4 pt-1"
              dangerouslySetInnerHTML={{
                __html: article.content || `<p>${article.snippet}</p>`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
