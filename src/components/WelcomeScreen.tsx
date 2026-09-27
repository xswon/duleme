import React, { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Upload } from "lucide-react";
import type { CuratedFeedOption } from "../types";

interface WelcomeScreenProps {
  featuredFeeds: CuratedFeedOption[];
  onUseFeatured: (feedIds: string[]) => void;
  onImportOpml: (file: File) => Promise<boolean>;
  onStartEmpty: () => void;
}

function categoryLabel(category: string): string {
  return category.replace(/\s*\|\s*/g, " · ");
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-8 text-slate-900">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
          <button
            type="button"
            onClick={() => setView("welcome")}
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
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

          <div className="max-h-[54vh] space-y-2 overflow-y-auto pr-1">
            {featuredFeeds.map((feed) => {
              const selected = selectedIds.has(feed.id);
              return (
                <button
                  key={feed.id}
                  type="button"
                  onClick={() => toggleFeed(feed.id)}
                  aria-pressed={selected}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent"
                  }`}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <img
                    src={feed.favicon}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-md object-contain"
                    onError={(event) => { (event.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{feed.title}</span>
                    <span className="block truncate text-xs text-slate-500">{categoryLabel(feed.category)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <span className="text-sm text-slate-500">已选择 {selectedIds.size} 个订阅</span>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => onUseFeatured(featuredFeeds.filter((feed) => selectedIds.has(feed.id)).map((feed) => feed.id))}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-8 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-200/50 sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">读了么</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-500">
          把你真正想看的内容，放在一个安静的地方。
        </p>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => setView("featured")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            使用精选订阅开始
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
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
