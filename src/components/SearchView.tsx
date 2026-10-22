import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Headphones, Search as SearchIcon, X } from "lucide-react";
import { Article, Feed } from "../types";
import { getHighlightSegments, getPreparedSearchDocument, getSearchExcerpt, type SearchResult } from "../services/searchService";
import { VirtualWindow } from "./VirtualWindow";
import { displayAuthor } from "../services/authorDisplay";

export interface SearchViewProps {
  results: SearchResult[];
  feeds: Feed[];
  searchQuery: string;
  resultQuery?: string;
  setSearchQuery: (q: string) => void;
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  onResolveThumbnail?: (articleId: string, url: string) => void;
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
  results,
  searchQuery,
  resultQuery = searchQuery,
  setSearchQuery,
  onSelectArticle,
  selectedArticleId,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "article" | "podcast">("all");
  const pending = searchQuery.trim() !== resultQuery.trim();
  const visibleResults = useMemo(() => !searchQuery.trim() || pending ? [] : results.filter(({ article }) => (
    typeFilter === "all" || (typeFilter === "podcast" ? Boolean(article.audioUrl?.trim()) : !article.audioUrl?.trim())
  )), [pending, results, searchQuery, typeFilter]);
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

  return (
    <div className="wreader-tool-view wreader-search-view min-h-full">
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

      {searchQuery.trim() && <div className="wreader-search-controls" aria-label="搜索结果筛选">
        {(["all", "article", "podcast"] as const).map((type) => <button key={type} type="button" aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>{type === "all" ? "全部" : type === "article" ? "文章" : "播客"}</button>)}
        <span role="status" className="wreader-search-count">{pending ? "正在搜索…" : `${visibleResults.length} 条结果`}</span>
      </div>}
      <div className="wreader-search-results" aria-live="polite" aria-busy={pending}>
        {visibleResults.length > 0 ? <VirtualWindow
          count={visibleResults.length}
          estimateSize={96}
          gap={4}
          overscan={10}
          className="wreader-search-virtual-window"
          getItemKey={(index) => visibleResults[index].article.id}
          renderItem={(index) => {
          const article = visibleResults[index].article;
          const fields = getPreparedSearchDocument(article).fields;
          return (
          <button
            type="button"
            key={article.id}
            className={`wreader-search-result${selectedArticleId === article.id ? " is-selected" : ""}`}
            onClick={() => onSelectArticle(article)}
          >
            <span className="wreader-search-result-icon">{article.audioUrl?.trim() ? <Headphones /> : <FileText />}</span>
            <span className="wreader-search-result-copy">
              <strong><HighlightedText text={fields.title} query={resultQuery} /></strong>
              <small>
                <HighlightedText text={fields.source} query={resultQuery} />
                {displayAuthor(article.author, article.feedTitle) ? <> · <HighlightedText text={displayAuthor(article.author, article.feedTitle)} query={resultQuery} /></> : null}
              </small>
              <span className="wreader-search-excerpt"><HighlightedText text={getSearchExcerpt(article, resultQuery, 110)} query={resultQuery} /></span>
            </span>
            <time dateTime={article.pubDate}>{formatRelativeTime(article.pubDate)}</time>
          </button>
          );
        }} /> : (
          <div className="wreader-search-empty">
            <SearchIcon />
            <strong>{pending ? "正在搜索…" : searchQuery.trim() ? "未找到匹配内容" : "开始搜索"}</strong>
            <span>{pending ? "正在查找文章和播客。" : searchQuery.trim() ? "尝试更换关键词或内容类型。" : "输入关键词即可搜索全部订阅源。"}</span>
          </div>
        )}
      </div>
    </div>
  );
};
