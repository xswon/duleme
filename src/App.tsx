import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ActiveTab,
  Article,
  Feed,
  FilterType,
  ThemeMode,
  ViewMode,
} from "./types";
import {
  getStoredFeeds,
  saveStoredFeeds,
  getStoredArticles,
  saveStoredArticles,
  fetchRssFeed,
  exportOpml,
} from "./services/rssService";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ArticleList } from "./components/ArticleList";
import { ArticleDetailModal } from "./components/ArticleDetailModal";
import { AddFeedModal } from "./components/AddFeedModal";
import { ManageFeedsModal, SortMode } from "./components/ManageFeedsModal";
import { SearchView } from "./components/SearchView";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { HelpCircle, Sparkles } from "lucide-react";

export default function App() {
  // Primary Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>("feeds");
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // View & Filter Preferences
  const [viewMode, setViewMode] = useState<ViewMode>("magazine");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [theme] = useState<ThemeMode>("light");
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

  // Ensure Light Mode
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

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

  // Handler: Mark category as read
  const handleMarkCategoryRead = (category: string) => {
    const categoryFeedIds = new Set(
      feeds.filter((f) => f.category === category).map((f) => f.id)
    );
    setArticles((prev) =>
      prev.map((a) => (categoryFeedIds.has(a.feedId) ? { ...a, read: true } : a))
    );
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
          const mappedItems: Article[] = (parsed.items || []).map((item) => ({
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
          const existingIds = new Set(prev.map((a) => a.id));
          const trulyNew = fetchedNewArticles.filter((a) => !existingIds.has(a.id));
          return [...trulyNew, ...prev];
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [feeds, isRefreshing]);

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
        const title = node.getAttribute("title") || node.getAttribute("text") || `Imported Feed ${idx + 1}`;
        const parentCategory =
          node.parentElement?.getAttribute("title") ||
          node.parentElement?.getAttribute("text") ||
          "Imported";

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
        alert(`Successfully imported ${importedFeeds.length} feeds from OPML!`);
        handleRefreshAllFeeds();
      } else {
        alert("No valid RSS outlines found in the OPML file.");
      }
    } catch (e: any) {
      alert(`OPML parse error: ${e.message || "Unknown error"}`);
    }
  };

  // Keyboard Navigation Listeners (Inoreader Hotkeys)
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
      } else if (e.key === "1") {
        setViewMode("list");
      } else if (e.key === "2") {
        setViewMode("card");
      } else if (e.key === "3") {
        setViewMode("magazine");
      } else if (e.key === "?") {
        setIsShortcutsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedArticle, articles]);

  // Compute Active Title
  const activeTitle = useMemo(() => {
    if (activeTab === "saved") return "Saved Articles";
    if (activeTab === "search") return "Global Article Search";
    if (activeTab === "add_feed") return "Add Feed";
    if (selectedFeedId) {
      const target = feeds.find((f) => f.id === selectedFeedId);
      return target ? target.title : "Feed Articles";
    }
    if (selectedCategory) return selectedCategory;
    return "Newsfeed";
  }, [activeTab, selectedFeedId, selectedCategory, feeds]);

  // Compute Visible Articles according to current tab & filters
  const visibleArticles = useMemo(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return articles.filter((article) => {
      // 0. Only show articles published within 7 days (unless explicitly starred)
      const pubTime = new Date(article.pubDate).getTime();
      if (!isNaN(pubTime) && pubTime < now - SEVEN_DAYS_MS && !article.starred) {
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
        onMarkCategoryRead={handleMarkCategoryRead}
        onExportOpml={() => exportOpml(feeds)}
        onImportOpmlClick={() => setIsAddFeedOpen(true)}
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
      />

      {/* Main Reader Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Toolbar */}
        <Header
          activeTab={activeTab}
          currentTitle={activeTitle}
          viewMode={viewMode}
          setViewMode={setViewMode}
          filterType={filterType}
          setFilterType={setFilterType}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onRefresh={handleRefreshAllFeeds}
          onMarkAllRead={handleMarkAllRead}
          isRefreshing={isRefreshing}
          theme={theme}
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
              viewMode={viewMode}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSelectArticle={handleSelectArticle}
              onToggleStar={handleToggleStar}
              onToggleRead={handleToggleRead}
              onSummarizeAI={(article) => setSelectedArticle(article)}
            />
          ) : (
            <ArticleList
              articles={visibleArticles}
              viewMode={viewMode}
              onSelectArticle={handleSelectArticle}
              onToggleStar={handleToggleStar}
              onToggleRead={handleToggleRead}
              onSummarizeAI={(article) => setSelectedArticle(article)}
            />
          )}

          {/* Floating Keyboard Shortcuts Trigger */}
          <button
            onClick={() => setIsShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            className="fixed bottom-4 right-4 p-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 shadow-lg transition-all z-20 cursor-pointer"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </main>
      </div>

      {/* Reader Modal / Full Detail Pane */}
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
    </div>
  );
}
