import React, { useEffect, useMemo, useRef } from "react";
import { FileText, Search as SearchIcon, X } from "lucide-react";
import { Article, Feed } from "../types";
import { getHighlightSegments, searchArticles, stripHtml } from "../services/searchService";

export interface SearchViewProps {
  articles: Article[];
  feeds: Feed[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  onResolveThumbnail?: (articleId: string, url: string) => void;
  onResultsChange?: (articles: Article[]) => void;
  selectedArticleId?: string | null;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return <>{getHighlightSegments(text, query).map((segment, index) => segment.highlighted ? (
    <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
  ) : <React.Fragment key={`${segment.text}-${index}`}>{segment.text}</React.Fragment>)}</>;
}

function formatRelativeTime(pubDate: string) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export const SearchView: React.FC<SearchViewProps> = ({
  articles,
  searchQuery,
  setSearchQuery,
  onSelectArticle,
  onResultsChange,
  selectedArticleId,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchArticles(articles, searchQuery), [articles, searchQuery]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    onResultsChange?.(results.map(({ article }) => article));
  }, [results, onResultsChange]);

  return (
    <div className="wreader-tool-view wreader-search-view h-full overflow-y-auto">
      <header className="wreader-search-heading">
        <span>工具</span>
        <h2>搜索</h2>
        <p>在全部订阅源中查找文章。</p>
      </header>

      <label className="wreader-search-box">
        <SearchIcon aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          autoFocus
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索文章、订阅源或关键词"
          aria-label="全文搜索"
          aria-keyshortcuts="Control+K Meta+K"
        />
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery("")} title="清空搜索词" aria-label="清空搜索词"><X /></button>
        ) : <kbd>⌘K</kbd>}
      </label>

      <div className="wreader-search-results" aria-live="polite">
        {results.length > 0 ? results.map(({ article }) => (
          <button
            type="button"
            key={article.id}
            className={`wreader-search-result${selectedArticleId === article.id ? " is-selected" : ""}`}
            onClick={() => onSelectArticle(article)}
          >
            <span className="wreader-search-result-icon"><FileText /></span>
            <span className="wreader-search-result-copy">
              <strong><HighlightedText text={stripHtml(article.title)} query={searchQuery} /></strong>
              <small>
                <HighlightedText text={stripHtml(article.feedTitle)} query={searchQuery} />
                {article.author && article.author !== article.feedTitle ? <> · <HighlightedText text={stripHtml(article.author)} query={searchQuery} /></> : null}
              </small>
            </span>
            <time dateTime={article.pubDate}>{formatRelativeTime(article.pubDate)}</time>
          </button>
        )) : (
          <div className="wreader-search-empty">
            <SearchIcon />
            <strong>{searchQuery.trim() ? "未找到匹配文章" : "暂无可显示文章"}</strong>
            <span>{searchQuery.trim() ? "尝试更换关键词。" : "输入关键词即可搜索全部订阅源。"}</span>
          </div>
        )}
      </div>
    </div>
  );
};
