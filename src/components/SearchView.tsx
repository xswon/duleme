import React, { useState } from "react";
import { Search as SearchIcon, Star, X } from "lucide-react";
import { Article, Feed } from "../types";
import { ArticleList } from "./ArticleList";

interface SearchViewProps {
  articles: Article[];
  feeds: Feed[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  onResolveThumbnail?: (articleId: string, url: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  articles,
  feeds,
  searchQuery,
  setSearchQuery,
  onSelectArticle,
  onToggleStar,
  onToggleRead,
  onSummarizeAI,
  onResolveThumbnail,
}) => {
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<string>("ALL");
  const [readFilter, setReadFilter] = useState<"ALL" | "UNREAD" | "READ">("ALL");
  const [starredOnly, setStarredOnly] = useState(false);

  // Filter logic
  const filteredArticles = articles.filter((article) => {
    // 1. Keyword search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = article.title.toLowerCase().includes(q);
      const snippetMatch = article.snippet.toLowerCase().includes(q);
      const feedMatch = article.feedTitle.toLowerCase().includes(q);
      const authorMatch = article.author?.toLowerCase().includes(q);
      if (!titleMatch && !snippetMatch && !feedMatch && !authorMatch) {
        return false;
      }
    }

    // 2. Feed filter
    if (selectedFeedFilter !== "ALL" && article.feedId !== selectedFeedFilter) {
      return false;
    }

    // 3. Read status filter
    if (readFilter === "UNREAD" && article.read) return false;
    if (readFilter === "READ" && !article.read) return false;

    // 4. Starred filter
    if (starredOnly && !article.starred) return false;

    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Search Controls Bar */}
      <div className="p-4 bg-white space-y-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索所有订阅源的标题、内容或作者…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                title="清空"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Feed Selector */}
            <select
              value={selectedFeedFilter}
              onChange={(e) => setSelectedFeedFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">全部订阅源</option>
              {feeds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>

            {/* Read Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
              <button
                onClick={() => setReadFilter("ALL")}
                className={`px-2 py-1 rounded transition-colors ${
                  readFilter === "ALL" ? "bg-white text-slate-900 font-semibold shadow-xs" : "text-slate-500"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setReadFilter("UNREAD")}
                className={`px-2 py-1 rounded transition-colors ${
                  readFilter === "UNREAD" ? "bg-white text-slate-900 font-semibold shadow-xs" : "text-slate-500"
                }`}
              >
                未读
              </button>
              <button
                onClick={() => setReadFilter("READ")}
                className={`px-2 py-1 rounded transition-colors ${
                  readFilter === "READ" ? "bg-white text-slate-900 font-semibold shadow-xs" : "text-slate-500"
                }`}
              >
                已读
              </button>
            </div>

            {/* Starred Toggle */}
            <button
              onClick={() => setStarredOnly(!starredOnly)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all ${
                starredOnly
                  ? "bg-amber-100 text-amber-800 font-semibold"
                  : "bg-slate-50 text-slate-600 hover:text-slate-900"
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${starredOnly ? "fill-amber-500 text-amber-500" : ""}`} />
              <span>仅收藏</span>
            </button>
          </div>

          {/* Results Count */}
          <span className="text-slate-500 text-xs">
            找到 <strong className="text-blue-600">{filteredArticles.length}</strong> 篇文章
          </span>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto bg-white">
        <ArticleList
          articles={filteredArticles}
          onSelectArticle={onSelectArticle}
          onToggleStar={onToggleStar}
          onToggleRead={onToggleRead}
          onSummarizeAI={onSummarizeAI}
          onResolveThumbnail={onResolveThumbnail}
        />
      </div>
    </div>
  );
};
