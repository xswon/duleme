import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Podcast, Upload } from "lucide-react";
import type { CuratedFeedOption } from "../types";
import { backendRequest } from "../services/readerBackend";
import { retryBackendImage } from "../services/mediaAssetService";

interface WelcomeScreenProps {
  featuredFeeds: CuratedFeedOption[];
  onUseFeatured: (feedIds: string[], artworkById: Record<string, string>) => void;
  onImportOpml: (file: File) => Promise<boolean>;
  onStartEmpty: () => void;
}

function categoryLabel(category: string): string {
  return category.replace(/\s*\|\s*/g, " · ");
}

function FeedArtwork({ src, isPodcast }: { src?: string; isPodcast: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    const Icon = isPodcast ? Podcast : BookOpen;
    return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon className="h-5 w-5" /></span>;
  }
  return <img src={src} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-lg object-cover" onError={(event) => {
    if (!retryBackendImage(event.currentTarget, src)) setFailed(true);
  }} />;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  featuredFeeds,
  onUseFeatured,
  onImportOpml,
  onStartEmpty,
}) => {
  const [view, setView] = useState<"welcome" | "featured">("welcome");
  const [selectedIds, setSelectedIds] = useState(() => new Set(featuredFeeds.map((feed) => feed.id)));
  const [isImporting, setIsImporting] = useState(false);
  const [artworkById, setArtworkById] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (view !== "featured") return;
    let active = true;
    featuredFeeds.filter((feed) => feed.contentType === "podcast").forEach((feed) => {
      void backendRequest(`/api/rss/parse?url=${encodeURIComponent(feed.feedUrl)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((data: { feedImage?: string } | null) => {
          const image = data?.feedImage;
          if (active && image && !image.includes("google.com/s2/favicons")) {
            setArtworkById((current) => ({ ...current, [feed.id]: image }));
          }
        })
        .catch(() => { /* Keep the podcast placeholder when artwork is unavailable. */ });
    });
    return () => { active = false; };
  }, [view, featuredFeeds]);

  const toggleFeed = (feedId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(feedId)) next.delete(feedId);
      else next.add(feedId);
      return next;
    });
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const imported = await onImportOpml(file);
      if (!imported && fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsImporting(false);
    }
  };

  if (view === "featured") {
    return (
      <main className="flex min-h-dvh items-start justify-center overflow-hidden bg-slate-50 px-3 py-2 text-slate-900 sm:min-h-screen sm:items-center sm:overflow-visible sm:px-5 sm:py-8">
        <section className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col rounded-3xl border border-slate-200 bg-(--wreader-ui-surface) p-4 shadow-xl shadow-slate-200/50 sm:max-h-[calc(100vh-4rem)] sm:p-8">
          <button
            type="button"
            onClick={() => setView("welcome")}
            className="mb-5 wreader-btn wreader-btn-sm wreader-btn-ghost"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <div className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight">读了么精选</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              从当前精选库中预选 {featuredFeeds.length} 个订阅。取消不感兴趣的内容后即可开始，之后也能随时调整。
            </p>
          </div>

          <div className="grid min-h-0 max-h-[54dvh] flex-1 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:max-h-[54vh] sm:flex-none sm:grid-cols-2 sm:gap-x-6">
            {featuredFeeds.map((feed) => {
              const selected = selectedIds.has(feed.id);
              return (
                <button
                  key={feed.id}
                  type="button"
                  onClick={() => toggleFeed(feed.id)}
                  aria-pressed={selected}
                  className="wreader-featured-feed-card flex w-full min-w-0 items-center gap-3 rounded-xl text-left transition"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    selected ? "border-blue-600 bg-(--wreader-primary-button) text-white" : "border-slate-300 bg-(--wreader-ui-surface) text-transparent"
                  }`}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <FeedArtwork
                    key={artworkById[feed.id] || feed.favicon}
                    src={feed.contentType === "article" ? feed.favicon : artworkById[feed.id]}
                    isPodcast={feed.contentType === "podcast"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{feed.title}</span>
                    <span className="block truncate text-xs text-slate-500">{categoryLabel(feed.category)}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-semibold text-slate-600">
                    {feed.contentType === "podcast" ? "播客" : "文章"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 sm:mt-6 sm:gap-4 sm:pt-5">
            <span className="text-sm text-slate-500">已选择 {selectedIds.size} 个订阅</span>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => onUseFeatured(featuredFeeds.filter((feed) => selectedIds.has(feed.id)).map((feed) => feed.id), artworkById)}
              className="wreader-btn wreader-btn-lg wreader-btn-primary"
            >
              开始使用
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-slate-50 px-5 py-8 text-slate-900 sm:min-h-screen">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-(--wreader-ui-surface) p-7 text-center shadow-xl shadow-slate-200/50 sm:p-9">
        <img
          src="/brand-icon-navy.svg"
          alt=""
          aria-hidden="true"
          className="mx-auto h-14 w-14 rounded-2xl shadow-lg shadow-cyan-200/60"
        />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">读了么</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-500">
          把你真正想看的内容，放在一个安静的地方。
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setView("featured")}
            className="wreader-btn wreader-btn-lg wreader-btn-primary wreader-btn-block"
          >
            使用精选订阅开始
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="wreader-btn wreader-btn-lg wreader-btn-secondary wreader-btn-block"
          >
            <Upload className="h-4 w-4" />
            {isImporting ? "正在导入…" : "导入 OPML"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            className="hidden"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />

          <button
            type="button"
            onClick={onStartEmpty}
            className="wreader-btn wreader-btn-lg wreader-btn-secondary wreader-btn-block"
          >
            从空白开始
          </button>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-400">
          之后可随时在「添加订阅」中调整。
        </p>
      </section>
    </main>
  );
};
