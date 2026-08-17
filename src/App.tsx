import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ActiveTab,
  Article,
  Feed,
  FilterType,
} from "./types";
import {
  getStoredFeeds,
  saveStoredFeeds,
  getStoredArticles,
  saveStoredArticles,
  attachBidclubMatches,
  fetchRssFeed,
} from "./services/rssService";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ArticleList } from "./components/ArticleList";
import { ArticleDetailModal } from "./components/ArticleDetailModal";
import { AddFeedModal } from "./components/AddFeedModal";
import { ManageFeedsModal, SortMode } from "./components/ManageFeedsModal";
import { SearchView } from "./components/SearchView";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { HelpCircle } from "lucide-react";

export default function App() {
  // Primary Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>("feeds");
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // View & Filter Preferences
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  // Data State
  const [feeds, setFeeds] = useState<Feed[]>(getStoredFeeds);
  const [articles, setArticles] = useState<Article[]>(getStoredArticles);
  const [categories, setCategories] = useState<string[]>(() => {
    const defaultCats = [
      "政 | 经 | 史",
      "科技 | 商业",
      "投资 | 理财",
      "人文 | 生活",
    ];
    const feedCats = getStoredFeeds().map((f) => f.category || "未分类");
    return Array.from(new Set([...defaultCats, ...feedCats]));
  });

  // UI Modals & Overlays
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isAddFeedOpen, setIsAddFeedOpen] = useState(false);
  const [isManageFeedsOpen, setIsManageFeedsOpen] = useState(false);
  const [manageFeedsTab, setManageFeedsTab] = useState<
    "feeds" | "folders" | "sort"
  >("feeds");
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Lightweight toast notification
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Auto-sync state to localStorage
  useEffect(() => {
    saveStoredFeeds(feeds);
  }, [feeds]);

  useEffect(() => {
    saveStoredArticles(articles);
  }, [articles]);

  // Sync feed unread counts based on article state
  useEffect(() => {
    setFeeds((prevFeeds) =>
      prevFeeds.map((feed) => {
        const unreadCount = articles.filter(
          (a) => a.feedId === feed.id && !a.read
        ).length;
        return { ...feed, unreadCount };
      })
    );
  }, [articles]);

  // Handler: Add New Feed
  const handleAddFeed = (newFeed: Feed, newArticles: Article[] = []) => {
    setFeeds((prev) => [newFeed, ...prev.filter((f) => f.id !== newFeed.id)]);

    if (newArticles.length > 0) {
      setArticles((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const filteredNew = newArticles.filter((a) => !existingIds.has(a.id));
        return [...filteredNew, ...prev];
      });
    }

    setActiveTab("feeds");
    setSelectedFeedId(newFeed.id);
    setSelectedCategory(null);
  };

  // Handler: Delete / Unsubscribe Feed
  const handleDeleteFeed = (feedId: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    setArticles((prev) => prev.filter((a) => a.feedId !== feedId));
    if (selectedFeedId === feedId) {
      setSelectedFeedId(null);
    }
  };

  // Folder/Category Handlers
  const handleAddCategory = (catName: string) => {
    const trimmed = catName.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories((prev) => [...prev, trimmed]);
    }
  };

  const handleRenameCategory = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    setCategories((prev) => prev.map((c) => (c === oldName ? trimmed : c)));
    setFeeds((prev) =>
      prev.map((f) =>
        f.category === oldName ? { ...f, category: trimmed } : f
      )
    );
    if (selectedCategory === oldName) {
      setSelectedCategory(trimmed);
    }
  };

  const handleDeleteCategory = (catName: string) => {
    setCategories((prev) => prev.filter((c) => c !== catName));
    setFeeds((prev) =>
      prev.map((f) =>
        f.category === catName ? { ...f, category: "未分类" } : f
      )
    );
    if (selectedCategory === catName) {
      setSelectedCategory(null);
    }
  };

  const handleUpdateFeedCategory = (feedId: string, newCategory: string) => {
    setFeeds((prev) =>
      prev.map((f) => (f.id === feedId ? { ...f, category: newCategory } : f))
    );
  };

  const handleOpenManageFeeds = (
    tab: "feeds" | "folders" | "sort" = "feeds"
  ) => {
    setManageFeedsTab(tab);
    setIsManageFeedsOpen(true);
  };

  // Handler: Refresh all active feeds
  const handleRefreshAllFeeds = useCallback(async () => {
    if (isRefreshing || feeds.length === 0) return;
    setIsRefreshing(true);

    try {
      let fetchedNewArticles: Article[] = [];

      for (const feed of feeds) {
        try {
          const parsed = await fetchRssFeed(feed.feedUrl);
          const bidclubData = feed.bidclubFeedUrl
            ? await fetchRssFeed(feed.bidclubFeedUrl).catch((error) => {
                console.warn(`Failed to sync BidClub helper feed for ${feed.title}:`, error);
                return null;
              })
            : null;
          const matchedItems = bidclubData
            ? attachBidclubMatches(parsed.items, bidclubData.items)
            : parsed.items;
          const mappedItems: Article[] = (matchedItems || []).map((item) => ({
            ...item,
            feedId: feed.id,
            feedTitle: feed.title,
            feedFavicon: feed.favicon || parsed.favicon,
            read: false,
            starred: false,
          }));
          fetchedNewArticles = [...fetchedNewArticles, ...mappedItems];
        } catch (e) {
          console.warn(`Failed to sync feed ${feed.title}:`, e);
        }
      }

      if (fetchedNewArticles.length > 0) {
        setArticles((prev) => {
          const fetchedById = new Map(fetchedNewArticles.map((a) => [a.id, a]));
          const updatedExisting = prev.map((article) => {
            const fresh = fetchedById.get(article.id);
            return fresh
              ? { ...article, ...fresh, read: article.read, starred: article.starred, savedAt: article.savedAt, aiSummary: article.aiSummary }
              : article;
          });
          const existingIds = new Set(prev.map((a) => a.id));
          const trulyNew = fetchedNewArticles.filter((a) => !existingIds.has(a.id));
          return [...trulyNew, ...updatedExisting];
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [feeds, isRefreshing]);

  // Auto-refresh feeds once on initial mount so new default feeds populate articles
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    handleRefreshAllFeeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler: Toggle Star / Save Article
  const handleToggleStar = (articleId: string) => {
    setArticles((prev) =>
      prev.map((a) =>
        a.id === articleId
          ? {
              ...a,
              starred: !a.starred,
              savedAt: !a.starred ? new Date().toISOString() : undefined,
            }
          : a
      )
    );

    if (selectedArticle && selectedArticle.id === articleId) {
      setSelectedArticle((prev) =>
        prev ? { ...prev, starred: !prev.starred } : null
      );
    }
  };

  // Handler: Toggle Read State
  const handleToggleRead = (articleId: string) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId ? { ...a, read: !a.read } : a))
    );

    if (selectedArticle && selectedArticle.id === articleId) {
      setSelectedArticle((prev) =>
        prev ? { ...prev, read: !prev.read } : null
      );
    }
  };

  // Handler: Persist a lazily-resolved cover image (e.g. BidClub episode artwork)
  const handleResolveThumbnail = useCallback((articleId: string, url: string) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId && !a.thumbnail ? { ...a, thumbnail: url } : a))
    );
  }, []);

  // Handler: Select & Read Article
  const handleSelectArticle = (article: Article) => {
    setSelectedArticle(article);
    // Automatically mark as read on open
    if (!article.read) {
      handleToggleRead(article.id);
    }
  };

  // Handler: Mark All Visible Articles as Read
  const handleMarkAllRead = () => {
    setArticles((prev) =>
      prev.map((a) => {
        if (activeTab === "saved" && !a.starred) return a;
        if (selectedFeedId && a.feedId !== selectedFeedId) return a;
        if (selectedCategory) {
          const catFeedIds = new Set(
            feeds.filter((f) => f.category === selectedCategory).map((f) => f.id)
          );
          if (!catFeedIds.has(a.feedId)) return a;
        }
        return { ...a, read: true };
      })
    );
  };

  // Handler: OPML Import
  const handleImportOpmlFile = async (file: File) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const outlines = xmlDoc.querySelectorAll("outline[xmlUrl]");

      const importedFeeds: Feed[] = [];
      outlines.forEach((node, idx) => {
        const xmlUrl = node.getAttribute("xmlUrl");
        const title = node.getAttribute("title") || node.getAttribute("text") || `导入源 ${idx + 1}`;
        const parentCategory =
          node.parentElement?.getAttribute("title") ||
          node.parentElement?.getAttribute("text") ||
          "未分类";

        if (xmlUrl) {
          importedFeeds.push({
            id: `opml-${idx}-${Date.now()}`,
            title,
            feedUrl: xmlUrl,
            siteUrl: node.getAttribute("htmlUrl") || xmlUrl,
            category: parentCategory,
            unreadCount: 0,
          });
        }
      });

      if (importedFeeds.length > 0) {
        setFeeds((prev) => {
          const existingUrls = new Set(prev.map((f) => f.feedUrl));
          const newOnly = importedFeeds.filter((f) => !existingUrls.has(f.feedUrl));
          return [...newOnly, ...prev];
        });
        showToast(`成功导入 ${importedFeeds.length} 个订阅源`);
        handleRefreshAllFeeds();
      } else {
        showToast("OPML 文件中未找到有效的 RSS 订阅");
      }
    } catch (e: any) {
      showToast(`OPML 解析失败：${e.message || "未知错误"}`);
    }
  };

  // Keyboard Navigation Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore hotkeys when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "j" || e.key === "J") {
        // Next article
        if (visibleArticles.length > 0) {
          const currentIndex = selectedArticle
            ? visibleArticles.findIndex((a) => a.id === selectedArticle.id)
            : -1;
          const nextIndex = Math.min(currentIndex + 1, visibleArticles.length - 1);
          handleSelectArticle(visibleArticles[nextIndex]);
        }
      } else if (e.key === "k" || e.key === "K") {
        // Previous article
        if (visibleArticles.length > 0) {
          const currentIndex = selectedArticle
            ? visibleArticles.findIndex((a) => a.id === selectedArticle.id)
            : 0;
          const prevIndex = Math.max(currentIndex - 1, 0);
          handleSelectArticle(visibleArticles[prevIndex]);
        }
      } else if (e.key === "s" || e.key === "S") {
        if (selectedArticle) handleToggleStar(selectedArticle.id);
      } else if (e.key === "m" || e.key === "M") {
        if (selectedArticle) handleToggleRead(selectedArticle.id);
      } else if (e.key === "r" || e.key === "R") {
        handleRefreshAllFeeds();
      } else if (e.key === "a" || e.key === "A") {
        setIsAddFeedOpen(true);
      } else if (e.key === "?") {
        setIsShortcutsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedArticle, articles]);

  // Compute Active Title
  const activeTitle = useMemo(() => {
    if (activeTab === "saved") return "收藏文章";
    if (activeTab === "search") return "全文搜索";
    if (selectedFeedId) {
      const target = feeds.find((f) => f.id === selectedFeedId);
      return target ? target.title : "订阅文章";
    }
    if (selectedCategory) return selectedCategory;
    return "全部文章";
  }, [activeTab, selectedFeedId, selectedCategory, feeds]);

  // Compute Visible Articles according to current tab & filters
  const visibleArticles = useMemo(() => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return articles.filter((article) => {
      // 0. Only show articles published within 30 days (unless explicitly starred)
      const pubTime = new Date(article.pubDate).getTime();
      if (!isNaN(pubTime) && pubTime < now - THIRTY_DAYS_MS && !article.starred) {
        return false;
      }

      // 1. Tab Scope
      if (activeTab === "saved" && !article.starred) return false;

      // 2. Feed / Category Scope
      if (activeTab === "feeds") {
        if (selectedFeedId && article.feedId !== selectedFeedId) return false;
        if (selectedCategory) {
          const categoryFeedIds = new Set(
            feeds.filter((f) => f.category === selectedCategory).map((f) => f.id)
          );
          if (!categoryFeedIds.has(article.feedId)) return false;
        }
      }

      // 3. Header Filters
      if (filterType === "unread" && article.read) return false;
      if (filterType === "starred" && !article.starred) return false;

      // 4. Quick Header Search
      if (searchQuery.trim() && activeTab !== "search") {
        const q = searchQuery.toLowerCase();
        const matchTitle = article.title.toLowerCase().includes(q);
        const matchSnippet = article.snippet.toLowerCase().includes(q);
        const matchFeed = article.feedTitle.toLowerCase().includes(q);
        if (!matchTitle && !matchSnippet && !matchFeed) return false;
      }

      return true;
    });
  }, [articles, activeTab, selectedFeedId, selectedCategory, filterType, searchQuery, feeds]);

  // Totals
  const totalUnread = articles.filter((a) => !a.read).length;
  const totalSaved = articles.filter((a) => a.starred).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased transition-colors duration-200">
      {/* 1. Left Navigation Sidebar (Feeds, Saved, Search, Add Feed) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        feeds={feeds}
        categories={categories}
        selectedFeedId={selectedFeedId}
        setSelectedFeedId={setSelectedFeedId}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        totalUnread={totalUnread}
        totalSaved={totalSaved}
        onOpenAddFeed={() => setIsAddFeedOpen(true)}
        onOpenManageFeeds={handleOpenManageFeeds}
        sortMode={sortMode}
        setSortMode={setSortMode}
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
      />

      {/* Main Reader Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Toolbar */}
        <Header
          activeTab={activeTab}
          currentTitle={activeTitle}
          filterType={filterType}
          setFilterType={setFilterType}
          onRefresh={handleRefreshAllFeeds}
          onMarkAllRead={handleMarkAllRead}
          isRefreshing={isRefreshing}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onNavigateSearch={() => setActiveTab("search")}
          unreadCount={visibleArticles.filter((a) => !a.read).length}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-white relative scrollbar-thin">
          {activeTab === "search" ? (
            <SearchView
              articles={articles}
              feeds={feeds}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSelectArticle={handleSelectArticle}
              onToggleStar={handleToggleStar}
              onToggleRead={handleToggleRead}
              onSummarizeAI={(article) => setSelectedArticle(article)}
              onResolveThumbnail={handleResolveThumbnail}
            />
          ) : (
            <ArticleList
              articles={visibleArticles}
              onSelectArticle={handleSelectArticle}
              onToggleStar={handleToggleStar}
              onToggleRead={handleToggleRead}
              onSummarizeAI={(article) => setSelectedArticle(article)}
              onResolveThumbnail={handleResolveThumbnail}
            />
          )}

          {/* Floating Keyboard Shortcuts Trigger */}
          <button
            onClick={() => setIsShortcutsOpen(true)}
            title="键盘快捷键 (?)"
            className="fixed bottom-4 right-4 p-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 shadow-lg ring-1 ring-slate-900/5 transition-all z-20 cursor-pointer"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </main>
      </div>

      {/* Reader Modal */}
      {(() => {
        const selectedIndex = selectedArticle
          ? visibleArticles.findIndex((a) => a.id === selectedArticle.id)
          : -1;
        const handleNextArticle =
          selectedIndex >= 0 && selectedIndex < visibleArticles.length - 1
            ? () => setSelectedArticle(visibleArticles[selectedIndex + 1])
            : undefined;
        const handlePrevArticle =
          selectedIndex > 0
            ? () => setSelectedArticle(visibleArticles[selectedIndex - 1])
            : undefined;

        return (
          <ArticleDetailModal
            article={selectedArticle}
            onClose={() => setSelectedArticle(null)}
            onToggleStar={handleToggleStar}
            onToggleRead={handleToggleRead}
            onNextArticle={handleNextArticle}
            onPrevArticle={handlePrevArticle}
          />
        );
      })()}

      {/* Add Feed Subscription Center Modal */}
      <AddFeedModal
        isOpen={isAddFeedOpen}
        onClose={() => setIsAddFeedOpen(false)}
        existingFeeds={feeds}
        onAddFeed={handleAddFeed}
        onImportOpmlFile={handleImportOpmlFile}
      />

      {/* Settings / Manage Subscriptions Modal */}
      <ManageFeedsModal
        isOpen={isManageFeedsOpen}
        onClose={() => setIsManageFeedsOpen(false)}
        feeds={feeds}
        categories={categories}
        onAddCategory={handleAddCategory}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={handleDeleteCategory}
        onUpdateFeedCategory={handleUpdateFeedCategory}
        onDeleteFeed={handleDeleteFeed}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        initialTab={manageFeedsTab}
      />

      {/* Keyboard Hotkeys Reference */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-xl animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  );
}
