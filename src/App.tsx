import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Headphones } from "lucide-react";
import {
  ActiveTab,
  Article,
  Feed,
  FilterType,
  AudioProgress,
  ArticleNote,
  DetailTab,
} from "./types";
import {
  getStoredFeeds,
  getStoredArticles,
  saveStoredArticles,
  replaceStoredArticlesForFeeds,
  updateStoredArticleStatus,
  updateStoredArticlesStatus,
  deleteStoredArticlesByFeedId,
  loadStoredArticlesAsync,
  backfillArticleBidclubReferences,
  fetchRssFeed,
  attachBidclubSelfReferences,
  isBidclubFeedUrl,
  matchBidclubItems,
  mergeDefaultFeedFields,
  mergeFetchedFeedArticles,
  migrateArticleBackrefs,
  migrateAudioProgressMap,
  migrateStoredArticleNoteBackrefs,
  getStoredCategories,
  getStoredSortMode,
  saveStoredSortMode,
  STORAGE_KEY_FEED_SORT_MODE,
  STORAGE_KEY_FOLDER_SORT_MODE,
} from "./services/rssService";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ArticleList } from "./components/ArticleList";
import { ArticleDetailModal } from "./components/ArticleDetailModal";
import { AddFeedModal } from "./components/AddFeedModal";
import { SettingsPage } from "./components/ManageFeedsModal";
import type { SortMode } from "./services/feedSorting";
import {
  appendFeedToFolder,
  getStoredFeedOrder,
  moveFeedToFolder,
  moveFolderToUncategorized,
  normalizeFeedOrder,
  removeFeedFromOrder,
  renameFolderInOrder,
  STORAGE_KEY_FEED_ORDER_BY_FOLDER,
  type FeedOrderByFolder,
} from "./services/feedSorting";
import { SearchView } from "./components/SearchView";
import { PlaylistView } from "./components/PlaylistView";
import { NotesView } from "./components/NotesView";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { matchesSearchQuery } from "./services/searchService";
import {
  DEFAULT_HISTORY_WINDOW_DAYS,
  HISTORY_WINDOW_STEP_DAYS,
  canAutoMarkRead,
  countOlderArticles,
  getUnreadArticleIds,
  isRecencyLimitedTab,
  isVisibleInHistoryWindow,
  sortArticlesByPubDate,
} from "./services/articleVisibility";
import { countRecentUnreadArticles } from "./services/unreadCount";
import { BatchMutationCoordinator } from "./services/batchMutation";
import {
  deleteArticleNoteFromDB,
  deleteArticleNotesFromDB,
  getAllArticleNotesFromDB,
  getAppStateFromDB,
  createDataBackup,
  restoreDataBackup,
  NOTES_CHANGED_EVENT,
  saveArticleNoteToDB,
  migrateFeedsAndAppStateFromLocalStorageIfNeeded,
  replaceFeedsInDB,
  saveAppStateToDB,
} from "./services/dbService";
import { buildReaderUrl, parseReaderRoute, routeFromState, type ReaderRoute } from "./services/router";
import { useSharedAudioPlayer, type SharedAudioPlayer } from "./hooks/useAudioPlayer";
import type { TimelineContentFilter } from "./services/router";
import { subscribeToLocalDayRefresh } from "./services/localDayRefresh";

export default function App() {
  const initialRoute = parseReaderRoute(
    typeof window === "undefined" ? { pathname: "/today", search: "" } : window.location,
  );
  // Primary Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialRoute.activeTab === "settings" ? "feeds" : initialRoute.activeTab);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(initialRoute.selectedFeedId);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialRoute.selectedCategory);
  const readerScrollTopBeforeSettings = useRef(0);

  // View & Filter Preferences
  const [filterType, setFilterType] = useState<FilterType>(initialRoute.filterType);
  const [contentType, setContentType] = useState<TimelineContentFilter>(initialRoute.contentType);
  const [searchQuery, setSearchQuery] = useState(initialRoute.searchQuery);
  const [feedSortMode, setFeedSortMode] = useState<SortMode>(() => getStoredSortMode(STORAGE_KEY_FEED_SORT_MODE));
  const [folderSortMode, setFolderSortMode] = useState<SortMode>(() => getStoredSortMode(STORAGE_KEY_FOLDER_SORT_MODE));
  const [timelineSortOrder, setTimelineSortOrder] = useState<"newest" | "oldest">("newest");
  const [playlistSortOrder, setPlaylistSortOrder] = useState<"newest" | "oldest">("newest");

  // Playlist State & Audio Progress State
  const [playlistIds, setPlaylistIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("wreader_playlist");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [audioProgressMap, setAudioProgressMap] = useState<Record<string, AudioProgress>>(() => {
    try {
      const stored = localStorage.getItem("wreader_audio_progress");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Data State
  const [feeds, setFeeds] = useState<Feed[]>(getStoredFeeds);
  const [feedOrderByFolder, setFeedOrderByFolder] = useState<FeedOrderByFolder>(() => getStoredFeedOrder(getStoredFeeds()));
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleNotes, setArticleNotes] = useState<ArticleNote[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAppStateReady, setIsAppStateReady] = useState(false);
  const [categories, setCategories] = useState<string[]>(() => {
    const defaultCats = [
      "政 | 经 | 史",
      "科技 | 商业",
      "投资 | 理财",
      "人文 | 生活",
    ];
    return getStoredCategories(defaultCats, getStoredFeeds());
  });

  // UI Modals & Overlays
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(initialRoute.articleId);
  const [invalidArticleId, setInvalidArticleId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab | "notes" | undefined>(initialRoute.detailTab);
  const [isImmersive, setIsImmersive] = useState(false);
  const [detailOpenIntent, setDetailOpenIntent] = useState<
    { tab: "notes" } | { tab: "transcript"; note: ArticleNote } | undefined
  >();
  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedArticleId) || null,
    [articles, selectedArticleId]
  );

  useEffect(() => {
    if (!isInitializing && selectedArticleId && !selectedArticle) {
      setInvalidArticleId(selectedArticleId);
    } else if (selectedArticle) {
      setInvalidArticleId(null);
    }
  }, [isInitializing, selectedArticle, selectedArticleId]);
  const playablePlaylistIds = useMemo(
    () => playlistIds.filter((id) => articles.some((article) => article.id === id && !!article.audioUrl?.trim())),
    [articles, playlistIds]
  );
  const playlistArticles = useMemo(
    () => playablePlaylistIds.map((id) => articles.find((article) => article.id === id)).filter((article): article is Article => !!article),
    [articles, playablePlaylistIds]
  );
  const [isAddFeedOpen, setIsAddFeedOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(initialRoute.activeTab === "settings");
  const [settingsInitialTab, setSettingsInitialTab] = useState<"feeds" | "folders" | "transcript" | "insight" | "data" | "shortcuts">("feeds");
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshState, setRefreshState] = useState<{
    completed: number;
    total: number;
    successful: number;
    failed: Feed[];
    newArticles: number;
    startedAt?: number;
    finishedAt?: number;
  }>({ completed: 0, total: 0, successful: 0, failed: [], newArticles: 0 });
  const [pendingRefreshFeedIds, setPendingRefreshFeedIds] = useState<string[] | null>(null);
  const [searchVisibleArticles, setSearchVisibleArticles] = useState<Article[]>([]);
  const [searchResultsReady, setSearchResultsReady] = useState(false);
  const [historyWindowDays, setHistoryWindowDays] = useState(initialRoute.historyWindowDays);
  const [localDayVersion, setLocalDayVersion] = useState(0);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const detailScrollPositions = useRef<Record<string, number>>({});
  const autoReadTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const playlistUndoRef = useRef<string[] | null>(null);
  const playlistUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readUndoRef = useRef<string[] | null>(null);
  const readUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchReadMutationRef = useRef(new BatchMutationCoordinator());
  const autoPlayNextRef = useRef<string | null>(null);
  const audioPlayerRef = useRef<SharedAudioPlayer | null>(null);
  const visibleArticlesRef = useRef<Article[]>([]);
  const feedsRef = useRef(feeds);
  const refreshGeneration = useRef(0);
  const refreshInFlight = useRef(false);
  const routeReady = useRef(false);
  const lastPushedUrl = useRef<string | null>(null);

  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  const currentRoute = useCallback((overrides: Partial<ReaderRoute> = {}): ReaderRoute => routeFromState({
    activeTab,
    filterType,
    selectedFeedId,
    selectedCategory,
    searchQuery,
    articleId: selectedArticleId,
    contentType,
    historyWindowDays,
    detailTab: Object.prototype.hasOwnProperty.call(overrides, "detailTab") ? overrides.detailTab : activeDetailTab,
    ...overrides,
  }), [activeTab, activeDetailTab, contentType, filterType, historyWindowDays, selectedFeedId, selectedCategory, searchQuery, selectedArticleId]);

  const navigateToRoute = useCallback((next: Partial<ReaderRoute>, replace = false) => {
    const route = currentRoute(next);
    const url = buildReaderUrl(route);
    if (typeof window !== "undefined" && window.location.pathname + window.location.search !== url) {
      if (replace) window.history.replaceState({}, "", url);
      else window.history.pushState({}, "", url);
      lastPushedUrl.current = url;
    }
    setActiveTab(route.activeTab);
    setFilterType(route.filterType);
    setContentType(route.contentType);
    setHistoryWindowDays(route.historyWindowDays);
    setSelectedFeedId(route.selectedFeedId);
    setSelectedCategory(route.selectedCategory);
    setSearchQuery(route.searchQuery);
    setSelectedArticleId(route.articleId);
    setActiveDetailTab(route.detailTab);
    setDetailOpenIntent(route.detailTab === "notes" ? { tab: "notes" } : route.detailTab === "transcript" ? undefined : undefined);
    setIsMobileMenuOpen(false);
  }, [currentRoute]);

  useEffect(() => {
    if (routeReady.current) return;
    routeReady.current = true;
    const handlePopState = () => {
      const route = parseReaderRoute(window.location);
      setIsSettingsOpen(route.activeTab === "settings");
      setActiveTab(route.activeTab === "settings" ? "feeds" : route.activeTab);
      setFilterType(route.filterType);
      setContentType(route.contentType);
      setHistoryWindowDays(route.historyWindowDays);
      setSelectedFeedId(route.selectedFeedId);
      setSelectedCategory(route.selectedCategory);
      setSearchQuery(route.searchQuery);
      setSelectedArticleId(route.articleId);
      setActiveDetailTab(route.detailTab);
      setDetailOpenIntent(route.detailTab === "notes" ? { tab: "notes" } : undefined);
      setIsMobileMenuOpen(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => subscribeToLocalDayRefresh(() => {
    setLocalDayVersion((version) => version + 1);
  }), []);

  useEffect(() => {
    if (!routeReady.current || typeof window === "undefined") return;
    const url = buildReaderUrl(currentRoute());
    if (window.location.pathname + window.location.search !== url && lastPushedUrl.current !== url) {
      window.history.replaceState({}, "", url);
    }
    lastPushedUrl.current = null;
  }, [currentRoute]);

  // Lightweight toast notification
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshFeedback, setRefreshFeedback] = useState<"success" | "failure" | null>(null);
  const [isRefreshFailureDetailsOpen, setIsRefreshFailureDetailsOpen] = useState(false);
  const refreshFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast({ message: msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  const showToastWithAction = useCallback((msg: string, action: { label: string; run: () => void }) => {
    setToast({ message: msg, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!refreshState.finishedAt || isRefreshing) return;
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
    if (refreshState.failed.length > 0) {
      setRefreshFeedback("failure");
      setIsRefreshFailureDetailsOpen(false);
      return;
    }
    setRefreshFeedback("success");
    refreshFeedbackTimer.current = setTimeout(() => setRefreshFeedback(null), 3500);
  }, [isRefreshing, refreshState.failed.length, refreshState.finishedAt]);

  // Business state lives in IndexedDB. Legacy localStorage is read once and
  // removed only after a verified write succeeds.
  useEffect(() => {
    let cancelled = false;
    void migrateFeedsAndAppStateFromLocalStorageIfNeeded(feeds, {
      categories,
      feedOrderByFolder,
      playlistIds,
      audioProgressMap,
    }).then(({ feeds: storedFeeds, state }) => {
      if (cancelled) return;
      if (storedFeeds.length > 0) setFeeds(storedFeeds);
      if (state.categories) setCategories(state.categories);
      if (state.feedOrderByFolder) setFeedOrderByFolder(normalizeFeedOrder(storedFeeds.length > 0 ? storedFeeds : feeds, state.feedOrderByFolder));
      if (state.playlistIds) setPlaylistIds(state.playlistIds);
      if (state.audioProgressMap) setAudioProgressMap(state.audioProgressMap);
      setIsAppStateReady(true);
      ["inoreader_feeds_v2", "wreader_categories_v1", STORAGE_KEY_FEED_ORDER_BY_FOLDER, "wreader_playlist", "wreader_audio_progress"].forEach((key) => localStorage.removeItem(key));
      localStorage.setItem("wreader_idb_migrated_v3", "1");
    }).catch((error) => {
      console.error("Failed to migrate app state to IndexedDB:", error);
      if (!cancelled) {
        setIsAppStateReady(true);
        showToast("本地数据迁移失败，原数据已保留；请重试或导出备份。");
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isAppStateReady) return;
    void replaceFeedsInDB(feeds).catch((error) => showToast(`订阅保存失败：${error instanceof Error ? error.message : "请重试"}`));
  }, [feeds, isAppStateReady, showToast]);

  useEffect(() => {
    setFeedOrderByFolder((previous) => normalizeFeedOrder(feeds, previous));
  }, [feeds]);

  useEffect(() => {
    if (!isAppStateReady) return;
    void saveAppStateToDB({ categories, feedOrderByFolder, playlistIds, audioProgressMap })
      .catch((error) => showToast(`本地数据保存失败：${error instanceof Error ? error.message : "请重试"}`));
  }, [audioProgressMap, categories, feedOrderByFolder, isAppStateReady, playlistIds, showToast]);

  useEffect(() => {
    saveStoredSortMode(STORAGE_KEY_FEED_SORT_MODE, feedSortMode);
  }, [feedSortMode]);

  useEffect(() => {
    saveStoredSortMode(STORAGE_KEY_FOLDER_SORT_MODE, folderSortMode);
  }, [folderSortMode]);

  useEffect(() => {
    let cancelled = false;
    loadStoredArticlesAsync()
      .then((storedArticles) => {
        if (!cancelled) setArticles(storedArticles);
      })
      .catch((error) => {
        console.error("Failed to initialize article storage:", error);
        if (!cancelled) setArticles(getStoredArticles());
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const reloadNotes = () => {
      void getAllArticleNotesFromDB()
        .then((notes) => { if (!cancelled) setArticleNotes(notes); })
        .catch((error) => console.warn("Failed to load notes:", error));
    };
    reloadNotes();
    window.addEventListener(NOTES_CHANGED_EVENT, reloadNotes);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTES_CHANGED_EVENT, reloadNotes);
    };
  }, []);

  const handleTogglePlaylist = useCallback(
    (articleId: string) => {
      const removing = playlistIds.includes(articleId);
      setPlaylistIds((prev) => {
        if (removing) {
          showToast("已从播放列表中移除");
          return prev.filter((id) => id !== articleId);
        } else {
          showToast("已加入音频播放列表");
          return [...prev, articleId];
        }
      });
      if (removing && (audioPlayerRef.current?.articleId === articleId || selectedArticleId === articleId)) {
        const currentIndex = playablePlaylistIds.indexOf(articleId);
        const nextId = currentIndex >= 0
          ? playablePlaylistIds[currentIndex + 1] ?? playablePlaylistIds[currentIndex - 1]
          : undefined;
        const nextArticle = nextId ? articles.find((item) => item.id === nextId) : undefined;
        if (audioPlayerRef.current?.articleId === articleId) {
          audioPlayerRef.current.stop();
          if (nextArticle?.audioUrl) audioPlayerRef.current.loadArticle(nextArticle.id, nextArticle.audioUrl, audioProgressMap[nextArticle.id]);
        }
        autoPlayNextRef.current = null;
        setSelectedArticleId(nextId || null);
      }
    },
    [articles, audioProgressMap, playlistIds, playablePlaylistIds, selectedArticleId, showToast]
  );

  const handleRemoveFromPlaylist = useCallback(
    (articleId: string) => {
      setPlaylistIds((prev) => prev.filter((id) => id !== articleId));
      if (audioPlayerRef.current?.articleId === articleId || selectedArticleId === articleId) {
        const currentIndex = playablePlaylistIds.indexOf(articleId);
        const nextId = currentIndex >= 0
          ? playablePlaylistIds[currentIndex + 1] ?? playablePlaylistIds[currentIndex - 1]
          : undefined;
        const nextArticle = nextId ? articles.find((item) => item.id === nextId) : undefined;
        if (audioPlayerRef.current?.articleId === articleId) {
          audioPlayerRef.current.stop();
          if (nextArticle?.audioUrl) audioPlayerRef.current.loadArticle(nextArticle.id, nextArticle.audioUrl, audioProgressMap[nextArticle.id]);
        }
        autoPlayNextRef.current = null;
        setSelectedArticleId(nextId || null);
      }
      showToast("已从播放列表中移除");
    },
    [articles, audioProgressMap, playablePlaylistIds, selectedArticleId, showToast]
  );

  const handleUndoPlaylistClear = useCallback(() => {
    if (!playlistUndoRef.current) return;
    setPlaylistIds(playlistUndoRef.current);
    playlistUndoRef.current = null;
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
    showToast("已恢复播放列表");
  }, [showToast]);

  const handleRemoveManyFromPlaylist = useCallback((articleIds: string[]) => {
    if (articleIds.length === 0) return;
    const ids = new Set(articleIds);
    playlistUndoRef.current = playlistIds;
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
    setPlaylistIds((prev) => prev.filter((id) => !ids.has(id)));
    const currentAudioId = audioPlayerRef.current?.articleId;
    if (currentAudioId && ids.has(currentAudioId)) {
      const nextId = playablePlaylistIds.find((id) => !ids.has(id));
      const nextArticle = nextId ? articles.find((item) => item.id === nextId) : undefined;
      audioPlayerRef.current?.stop();
      if (nextArticle?.audioUrl) audioPlayerRef.current?.loadArticle(nextArticle.id, nextArticle.audioUrl, audioProgressMap[nextArticle.id]);
      setSelectedArticleId(nextId || null);
    }
    showToastWithAction(`已从播放列表移除 ${articleIds.length} 集`, { label: "撤销", run: handleUndoPlaylistClear });
    playlistUndoTimer.current = setTimeout(() => { playlistUndoRef.current = null; }, 5000);
  }, [articles, audioProgressMap, handleUndoPlaylistClear, playablePlaylistIds, playlistIds, showToastWithAction]);

  const handleClearPlaylist = useCallback(() => {
    if (playlistIds.length === 0) return;
    playlistUndoRef.current = playlistIds;
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
    setPlaylistIds([]);
    if (audioPlayerRef.current?.articleId && playlistIds.includes(audioPlayerRef.current.articleId)) {
      audioPlayerRef.current.stop();
      setSelectedArticleId(null);
    }
    showToastWithAction(`已清空播放列表（${playlistIds.length} 集）`, { label: "撤销", run: handleUndoPlaylistClear });
    playlistUndoTimer.current = setTimeout(() => {
      playlistUndoRef.current = null;
    }, 5000);
  }, [playlistIds, showToastWithAction, handleUndoPlaylistClear]);

  const handleClearFavorites = useCallback(async () => {
    const favoriteIds = articles.filter((article) => article.starred).map((article) => article.id);
    if (favoriteIds.length === 0) {
      showToast("收藏已清空");
      return;
    }

    const favoriteIdSet = new Set(favoriteIds);
    const previousFavorites = new Map(articles.filter((article) => favoriteIdSet.has(article.id)).map((article) => [article.id, article]));
    setArticles((current) => current.map((article) => favoriteIdSet.has(article.id)
      ? { ...article, starred: false, savedAt: undefined }
      : article));
    try {
      await updateStoredArticlesStatus(favoriteIds, { starred: false, savedAt: undefined });
      showToast("收藏已清空");
    } catch (error) {
      console.warn("Failed to clear favorites:", error);
      setArticles((current) => current.map((article) => previousFavorites.get(article.id) || article));
      showToast("收藏清空失败，请重试");
    }
  }, [articles, showToast]);

  const handleReorderPlaylist = useCallback((nextIds: string[]) => {
    setPlaylistIds((current) => {
      const allowed = new Set(current);
      const reordered = nextIds.filter((id) => allowed.has(id));
      const missing = current.filter((id) => !reordered.includes(id));
      return [...reordered, ...missing];
    });
  }, []);

  const handleSearchResultsChange = useCallback((results: Article[]) => {
    setSearchVisibleArticles(results);
    setSearchResultsReady(true);
  }, []);

  const handleAudioEnded = useCallback((articleId: string) => {
    const currentIndex = playablePlaylistIds.indexOf(articleId);
    const nextId = currentIndex >= 0 ? playablePlaylistIds[currentIndex + 1] : undefined;
    if (!nextId) {
      showToast("本集播放完毕，已到播放列表末尾");
      return;
    }
    const nextArticle = articles.find((article) => article.id === nextId);
    if (!nextArticle) return;
    autoPlayNextRef.current = nextId;
    setSelectedArticleId(nextId);
  }, [articles, playablePlaylistIds, showToast]);

  const handleUpdateAudioProgress = useCallback(
    (articleId: string, currentTime: number, duration: number) => {
      setAudioProgressMap((prev) => {
        const existing = prev[articleId];
        if (
          existing &&
          Math.abs(existing.currentTime - currentTime) < 1 &&
          existing.duration === duration
        ) {
          return prev;
        }
        return {
          ...prev,
          [articleId]: {
            currentTime,
            duration,
            updatedAt: Date.now(),
          },
        };
      });
    },
    []
  );

  const audioPlayer = useSharedAudioPlayer(handleUpdateAudioProgress, handleAudioEnded);
  audioPlayerRef.current = audioPlayer;

  // The single entry point for article fields that are updated by detail views.
  const handleArticlePatch = useCallback((articleId: string, patch: Partial<Article>) => {
    const previous = articles.find((article) => article.id === articleId);
    setArticles((prev) =>
      prev.map((article) => (article.id === articleId ? { ...article, ...patch } : article))
    );
    void updateStoredArticleStatus(articleId, patch).catch((error) => {
      if (previous) setArticles((current) => current.map((article) => article.id === articleId ? { ...article, ...previous } : article));
      showToast(`文章保存失败：${error instanceof Error ? error.message : "请重试"}`);
    });
  }, [articles, showToast]);

  const bidclubRepairInFlight = useRef("");
  const completedBidclubRepairFingerprint = useRef("");
  const isMounted = useRef(true);
  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  const bidclubFeedConfigFingerprint = useMemo(
    () => JSON.stringify(
      feeds
        .filter((feed) => !!feed.bidclubFeedUrl)
        .map((feed) => [feed.id, feed.bidclubFeedUrl])
        .sort(([left], [right]) => left.localeCompare(right))
    ),
    [feeds]
  );

  useEffect(() => {
    if (isInitializing || articles.length === 0) return;
    const bidclubRepairFeedIds = new Set(
      feeds
        .filter((feed) => !!feed.bidclubFeedUrl || isBidclubFeedUrl(feed.feedUrl))
        .map((feed) => feed.id)
    );
    const repairableIds = articles
      .filter((article) => bidclubRepairFeedIds.has(article.feedId) && article.enrichment?.status !== "available")
      .map((article) => `${article.feedId}:${article.id}`)
      .sort();
    if (repairableIds.length === 0) return;
    const helperUrls = feeds
      .flatMap((feed) => [feed.bidclubFeedUrl, isBidclubFeedUrl(feed.feedUrl) ? feed.feedUrl : undefined])
      .filter(Boolean)
      .sort();
    const fingerprint = JSON.stringify([repairableIds, helperUrls]);
    if (
      bidclubRepairInFlight.current === fingerprint ||
      completedBidclubRepairFingerprint.current === fingerprint
    ) return;
    bidclubRepairInFlight.current = fingerprint;

    void (async () => {
      try {
        const result = await backfillArticleBidclubReferences(articles, feeds);
        if (isMounted.current && result.changed) {
          const enrichmentById = new Map(
            result.articles
              .filter((article) => !!article.enrichment)
              .map((article) => [article.id, article.enrichment!])
          );
          setArticles((current) => {
            const patched = current.map((article) => {
              const enrichment = enrichmentById.get(article.id);
              return enrichment ? { ...article, enrichment } : article;
            });
            void saveStoredArticles(
              patched.filter((article) => enrichmentById.has(article.id))
            );
            return patched;
          });
        }
        if (result.failedFeedUrls.length === 0) {
          completedBidclubRepairFingerprint.current = fingerprint;
        }
        console.info("BidClub repair summary", result.diagnostics);
      } catch (error) {
        console.warn("Failed to repair BidClub helper feeds:", error);
      } finally {
        if (bidclubRepairInFlight.current === fingerprint) {
          bidclubRepairInFlight.current = "";
        }
      }
    })();
  }, [articles, bidclubFeedConfigFingerprint, feeds, isInitializing]);

  // Sync feed unread counts based on article state
  useEffect(() => {
    setFeeds((prevFeeds) =>
      prevFeeds.map((feed) => {
        const unreadCount = countRecentUnreadArticles(
          articles.filter((article) => article.feedId === feed.id)
        );
        return { ...feed, unreadCount };
      })
    );
  }, [articles, localDayVersion]);

  // Handler: Add New Feed
  const handleAddFeed = (newFeed: Feed, newArticles: Article[] = []) => {
    const stayInSettings = isSettingsOpen;
    setFeeds((prev) => [newFeed, ...prev.filter((f) => f.id !== newFeed.id)]);
    setFeedOrderByFolder((prev) => appendFeedToFolder(removeFeedFromOrder(prev, newFeed.id), newFeed));
    const newCategory = newFeed.category?.trim() || "未分类";
    setCategories((prev) => (prev.includes(newCategory) ? prev : [...prev, newCategory]));

    if (newArticles.length > 0) {
      void saveStoredArticles(newArticles);
      setArticles((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const filteredNew = newArticles.filter((a) => !existingIds.has(a.id));
        return [...filteredNew, ...prev];
      });
    }

    if (!stayInSettings) {
      navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: newFeed.id, selectedCategory: null, articleId: null, detailTab: undefined });
    }
  };

  // Handler: Delete / Unsubscribe Feed
  const handleDeleteFeed = (feedId: string) => {
    refreshGeneration.current += 1;
    setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    setFeedOrderByFolder((prev) => removeFeedFromOrder(prev, feedId));
    setArticles((prev) => prev.filter((a) => a.feedId !== feedId));
    void deleteStoredArticlesByFeedId(feedId);
    if (selectedFeedId === feedId) {
      setSelectedFeedId(null);
    }
  };

  // Folder/Category Handlers
  const handleAddCategory = (catName: string): string | undefined => {
    const trimmed = catName.trim();
    if (!trimmed) return "请输入文件夹名称";
    if (categories.some((category) => category.trim() === trimmed)) return "已有同名文件夹";
    setCategories((prev) => [...prev, trimmed]);
    showToast(`已创建文件夹「${trimmed}」`);
    return undefined;
  };

  const handleRenameCategory = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    setCategories((prev) => prev.map((c) => (c === oldName ? trimmed : c)));
    setFeedOrderByFolder((prev) => renameFolderInOrder(prev, oldName, trimmed));
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
    const hasFeeds = feeds.some((feed) => (feed.category || "未分类") === catName);
    setCategories((prev) => {
      const next = hasFeeds
        ? prev.map((category) => (category === catName ? "未分类" : category))
        : prev.filter((category) => category !== catName);
      return Array.from(new Set(next));
    });
    setFeedOrderByFolder((prev) => moveFolderToUncategorized(prev, catName));
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
    const currentFeed = feeds.find((feed) => feed.id === feedId);
    setFeeds((prev) =>
      prev.map((f) => (f.id === feedId ? { ...f, category: newCategory } : f))
    );
    if (currentFeed) {
      setFeedOrderByFolder((prev) => moveFeedToFolder(prev, feedId, currentFeed.category || "未分类", newCategory || "未分类"));
    }
  };

  const handleReorderFolderFeeds = (category: string, feedIds: string[]) => {
    setFeedOrderByFolder((previous) => ({ ...previous, [category]: [...feedIds] }));
  };

  const handleReorderCategories = (nextCategories: string[]) => {
    setCategories(nextCategories);
  };

  const handleUpdateFeedUrls = (
    feedId: string,
    urls: { feedUrl: string; bidclubFeedUrl?: string }
  ) => {
    const currentFeed = feeds.find((feed) => feed.id === feedId);
    const feedUrlChanged = !!currentFeed && currentFeed.feedUrl !== urls.feedUrl;

    setFeeds((prev) =>
      prev.map((feed) =>
        feed.id === feedId
          ? {
              ...feed,
              feedUrl: urls.feedUrl,
              bidclubFeedUrl: urls.bidclubFeedUrl,
              lastUpdated: new Date().toISOString(),
            }
          : feed
      )
    );

    if (feedUrlChanged) {
      setArticles((prev) => prev.filter((article) => article.feedId !== feedId));
      void deleteStoredArticlesByFeedId(feedId);
      if (selectedArticle?.feedId === feedId) {
        setSelectedArticleId(null);
      }
    }
  };

  // Handler: Refresh all active feeds
  const handleRefreshAllFeeds = useCallback(async (requestedFeedIds?: string[]) => {
    const generation = refreshGeneration.current;
    const sourceFeeds = feedsRef.current.filter((feed) => !requestedFeedIds || requestedFeedIds.includes(feed.id));
    if (isRefreshing || refreshInFlight.current || sourceFeeds.length === 0) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    const startedAt = Date.now();
    setRefreshState({ completed: 0, total: sourceFeeds.length, successful: 0, failed: [], newArticles: 0, startedAt });

    try {
      const results: Array<{
        feed: Feed;
        articles: Article[];
        feedIcon?: string;
      } | null> = new Array(sourceFeeds.length).fill(null);
      let nextFeedIndex = 0;
      const worker = async () => {
        while (nextFeedIndex < sourceFeeds.length) {
          const index = nextFeedIndex++;
          const feed = sourceFeeds[index];
          try {
            const parsed = await fetchRssFeed(feed.feedUrl);
            const feedIcon = parsed.feedImage || parsed.favicon || feed.favicon;
            const parsedItems = isBidclubFeedUrl(feed.feedUrl)
              ? attachBidclubSelfReferences(parsed.items)
              : parsed.items;
            const bidclubData = feed.bidclubFeedUrl
              ? await fetchRssFeed(feed.bidclubFeedUrl).catch((error) => {
                  console.warn(`Failed to sync BidClub helper feed for ${feed.title}:`, error);
                  return null;
                })
              : null;
            const matchResult = bidclubData
              ? matchBidclubItems(parsedItems, bidclubData.items)
              : null;
            const matchedItems = matchResult?.items || parsedItems;
            if (matchResult) console.info(`BidClub sync summary: ${feed.title}`, matchResult.diagnostics);
            results[index] = {
              feed,
              feedIcon,
              articles: (matchedItems || []).map((item) => ({
                ...item,
                feedId: feed.id,
                feedTitle: feed.title,
                feedFavicon: feedIcon,
                read: false,
                starred: false,
              })),
            };
            if (refreshGeneration.current !== generation) continue;
            setFeeds((current) => current.map((item) => item.id === feed.id
              ? { ...item, lastUpdated: new Date().toISOString(), lastSyncStatus: "success", lastSyncError: undefined }
              : item));
            setRefreshState((state) => ({ ...state, completed: state.completed + 1, successful: state.successful + 1 }));
          } catch (error) {
            const message = error instanceof Error ? error.message : "同步失败";
            console.warn(`Failed to sync feed ${feed.title}:`, error);
            if (refreshGeneration.current !== generation) continue;
            setFeeds((current) => current.map((item) => item.id === feed.id
              ? { ...item, lastSyncStatus: "error", lastSyncError: message }
              : item));
            setRefreshState((state) => ({ ...state, completed: state.completed + 1, failed: [...state.failed, { ...feed, lastSyncStatus: "error", lastSyncError: message }] }));
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(4, sourceFeeds.length) }, () => worker())
      );

      if (refreshGeneration.current !== generation) return;

      const successfulResults = results.filter((result): result is NonNullable<typeof result> => !!result);
      const fetchedNewArticles = successfulResults.flatMap((result) => result.articles);
      const existingIds = new Set(articles.map((article) => article.id));
      const newArticleCount = fetchedNewArticles.filter((article) => !existingIds.has(article.id)).length;
      setRefreshState((state) => ({ ...state, newArticles: newArticleCount, finishedAt: Date.now() }));
      const currentFeedIds = new Set(feedsRef.current.map((feed) => feed.id));
      const refreshedFeedIds = new Set(successfulResults.map((result) => result.feed.id).filter((id) => currentFeedIds.has(id)));
      const updatedIcons = new Map(
        successfulResults
          .filter((result) => result.feedIcon && result.feedIcon !== result.feed.favicon)
          .map((result) => [result.feed.id, result.feedIcon!])
      );
      if (updatedIcons.size > 0) {
        setFeeds((prev) => prev.map((feed) => {
          const favicon = updatedIcons.get(feed.id);
          return favicon ? { ...feed, favicon } : feed;
        }));
      }

      if (refreshedFeedIds.size > 0) {
        const merged = mergeFetchedFeedArticles(articles, fetchedNewArticles, refreshedFeedIds);
        await migrateStoredArticleNoteBackrefs(merged.articleIdMap);
        setArticles(merged.articles);
        void replaceStoredArticlesForFeeds(
          refreshedFeedIds,
          merged.articles.filter((article) => refreshedFeedIds.has(article.feedId))
        );
        setPlaylistIds((prev) => migrateArticleBackrefs(prev, merged.articleIdMap));
        setAudioProgressMap((prev) => migrateAudioProgressMap(prev, merged.articleIdMap));
        setSelectedArticleId((prev) => {
          if (!prev) return prev;
          const targetId = merged.articleIdMap.get(prev) || prev;
          const next = merged.articles.find((article) => article.id === targetId);
          return next ? next.id : null;
        });
      }
    } finally {
      refreshInFlight.current = false;
      setIsRefreshing(false);
      setRefreshState((state) => ({ ...state, finishedAt: state.finishedAt || Date.now() }));
    }
  }, [articles, isRefreshing]);

  const handleRetryFeed = useCallback(async (feedId: string) => {
    const feed = feeds.find((item) => item.id === feedId);
    const generation = refreshGeneration.current;
    if (!feed || isRefreshing || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    setRefreshState({ completed: 0, total: 1, successful: 0, failed: [feed], newArticles: 0, startedAt: Date.now() });
    try {
      const parsed = await fetchRssFeed(feed.feedUrl);
      const parsedItems = isBidclubFeedUrl(feed.feedUrl)
        ? attachBidclubSelfReferences(parsed.items)
        : parsed.items;
      const helper = feed.bidclubFeedUrl ? await fetchRssFeed(feed.bidclubFeedUrl).catch(() => null) : null;
      if (refreshGeneration.current !== generation || !feedsRef.current.some((item) => item.id === feedId)) return;
      const matched = helper ? matchBidclubItems(parsedItems, helper.items).items : parsedItems;
      const refreshed = (matched || []).map((item) => ({ ...item, feedId: feed.id, feedTitle: feed.title, feedFavicon: parsed.feedImage || parsed.favicon || feed.favicon, read: false, starred: false }));
      const merged = mergeFetchedFeedArticles(articles, refreshed, new Set([feed.id]));
      await migrateStoredArticleNoteBackrefs(merged.articleIdMap);
      setArticles(merged.articles);
      void replaceStoredArticlesForFeeds(new Set([feed.id]), merged.articles.filter((item) => item.feedId === feed.id));
      setPlaylistIds((prev) => migrateArticleBackrefs(prev, merged.articleIdMap));
      setAudioProgressMap((prev) => migrateAudioProgressMap(prev, merged.articleIdMap));
      setSelectedArticleId((prev) => prev ? merged.articleIdMap.get(prev) || prev : prev);
      setFeeds((current) => current.map((item) => item.id === feed.id ? { ...item, lastUpdated: new Date().toISOString(), lastSyncStatus: "success", lastSyncError: undefined } : item));
      setRefreshState({ completed: 1, total: 1, successful: 1, failed: [], newArticles: refreshed.filter((item) => !articles.some((existing) => existing.id === item.id)).length, startedAt: Date.now(), finishedAt: Date.now() });
      showToast(`已重试「${feed.title}」`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      const failed = { ...feed, lastSyncStatus: "error" as const, lastSyncError: message };
      setFeeds((current) => current.map((item) => item.id === feed.id ? failed : item));
      setRefreshState({ completed: 1, total: 1, successful: 0, failed: [failed], newArticles: 0, startedAt: Date.now(), finishedAt: Date.now() });
      showToast(`「${feed.title}」重试失败，可稍后再试`);
    } finally {
      refreshInFlight.current = false;
      setIsRefreshing(false);
    }
  }, [articles, feeds, isRefreshing, showToast]);

  useEffect(() => {
    if (!pendingRefreshFeedIds || isRefreshing) return;
    const ids = pendingRefreshFeedIds;
    setPendingRefreshFeedIds(null);
    void handleRefreshAllFeeds(ids);
  }, [handleRefreshAllFeeds, isRefreshing, pendingRefreshFeedIds]);

  // Sync once after storage initialization. Seeded or historical articles must
  // not suppress refresh: otherwise newly added subscriptions remain empty and
  // existing episodes never receive their BidClub references.
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (hasAutoRefreshed.current || isInitializing || !isAppStateReady) return;
    hasAutoRefreshed.current = true;
    handleRefreshAllFeeds();
  }, [handleRefreshAllFeeds, isAppStateReady, isInitializing]);
  // Handler: Toggle Star / Save Article
  const handleToggleStar = (articleId: string) => {
    const article = articles.find((item) => item.id === articleId);
    const patch = article ? { starred: !article.starred, savedAt: !article.starred ? new Date().toISOString() : undefined } : null;
    if (patch) void updateStoredArticleStatus(articleId, patch).catch(() => {
      setArticles((current) => current.map((item) => item.id === articleId ? { ...item, starred: article.starred, savedAt: article.savedAt } : item));
      showToast("收藏保存失败，请重试");
    });
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

  };

  // Handler: Toggle Read State
  const handleToggleRead = (articleId: string) => {
    if (autoReadTimers.current[articleId]) {
      clearTimeout(autoReadTimers.current[articleId]);
      delete autoReadTimers.current[articleId];
    }
    const article = articles.find((item) => item.id === articleId);
    if (article) void updateStoredArticleStatus(articleId, { read: !article.read }).catch(() => {
      setArticles((current) => current.map((item) => item.id === articleId ? { ...item, read: article.read } : item));
      showToast("已读状态保存失败，请重试");
    });
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId ? { ...a, read: !a.read } : a))
    );

  };

  // Handler: Select & Read Article
  const handleSelectArticle = (article: Article) => {
    const scopeKey = `${activeTab}:${selectedFeedId || "all"}:${selectedCategory || "all"}:${searchQuery}`;
    if (mainScrollRef.current) scrollPositions.current[scopeKey] = mainScrollRef.current.scrollTop;
    setDetailOpenIntent(undefined);
    setSelectedArticleId(article.id);
    navigateToRoute({ articleId: article.id, detailTab: undefined });
    if (canAutoMarkRead(article)) {
      if (autoReadTimers.current[article.id]) clearTimeout(autoReadTimers.current[article.id]);
      autoReadTimers.current[article.id] = setTimeout(() => {
        const current = articles.find((item) => item.id === article.id);
        if (current && !current.read) handleToggleRead(article.id);
        delete autoReadTimers.current[article.id];
      }, 2000);
    }
  };

  const handleUpdateReadingProgress = useCallback((articleId: string, progress: number) => {
    const normalized = Math.max(0, Math.min(1, progress));
    setArticles((current) => current.map((item) => item.id === articleId
      ? { ...item, readingProgress: normalized, readingProgressUpdatedAt: Date.now() }
      : item));
    void updateStoredArticleStatus(articleId, {
      readingProgress: normalized,
      readingProgressUpdatedAt: Date.now(),
    });
    if (normalized >= 0.4) {
      const article = articles.find((item) => item.id === articleId);
      if (article && canAutoMarkRead(article)) handleToggleRead(articleId);
    }
  }, [articles, handleToggleRead]);

  const closeArticle = useCallback(() => {
    setSelectedArticleId(null);
    setIsImmersive(false);
    setDetailOpenIntent(undefined);
    navigateToRoute({ articleId: null, detailTab: undefined }, true);
    Object.values(autoReadTimers.current).forEach((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
    autoReadTimers.current = {};
    const scopeKey = `${activeTab}:${selectedFeedId || "all"}:${selectedCategory || "all"}:${searchQuery}`;
    const position = scrollPositions.current[scopeKey];
    if (position !== undefined) requestAnimationFrame(() => {
      if (mainScrollRef.current) mainScrollRef.current.scrollTop = position;
    });
  }, [activeTab, navigateToRoute, searchQuery, selectedCategory, selectedFeedId]);

  const visibleArticleIds = new Set(articles.map((article) => article.id));
  const visibleArticleNotes = articleNotes.filter((note) => visibleArticleIds.has(note.articleId));

  const handleOpenNote = useCallback((note: ArticleNote) => {
    setIsImmersive(false);
    setDetailOpenIntent(note.source === "transcript" && note.transcriptStartMs !== undefined
      ? { tab: "transcript", note }
      : { tab: "notes" });
    setSelectedArticleId(note.articleId);
    navigateToRoute({ articleId: note.articleId, detailTab: note.source === "transcript" ? "transcript" : "notes" });
  }, [navigateToRoute]);

  const handleUpdateNote = useCallback((note: ArticleNote, text: string) => {
    const updated = { ...note, note: text.trim() || undefined, updatedAt: Date.now() };
    setArticleNotes((current) => current.map((item) => item.id === note.id ? updated : item));
    void saveArticleNoteToDB(updated).catch((error) => {
      console.warn("Failed to update note:", error);
      void getAllArticleNotesFromDB().then(setArticleNotes);
    });
  }, []);

  const handleDeleteNote = useCallback((note: ArticleNote) => {
    if (note.note && !window.confirm("这条摘录包含笔记内容，确定删除吗？")) return;
    setArticleNotes((current) => current.filter((item) => item.id !== note.id));
    void deleteArticleNoteFromDB(note.id).catch((error) => {
      console.warn("Failed to delete note:", error);
      void getAllArticleNotesFromDB().then(setArticleNotes);
    });
  }, []);

  const handleClearNotes = useCallback(async () => {
    const visibleIds = new Set(articles.map((article) => article.id));
    const notesToDelete = articleNotes.filter((note) => visibleIds.has(note.articleId));
    if (notesToDelete.length === 0) return;
    const previousNotes = articleNotes;
    const deletingIds = new Set(notesToDelete.map((note) => note.id));
    setArticleNotes((current) => current.filter((note) => !deletingIds.has(note.id)));
    try {
      await deleteArticleNotesFromDB(notesToDelete.map((note) => note.id));
      showToast("笔记已全部删除");
    } catch (error) {
      console.warn("Failed to delete notes:", error);
      try {
        setArticleNotes(await getAllArticleNotesFromDB());
      } catch {
        setArticleNotes(previousNotes);
      }
      showToast("笔记删除失败，请重试");
    }
  }, [articleNotes, articles, showToast]);

  // Handler: Mark All Visible Articles as Read
  const handleUndoMarkAllRead = useCallback(async function undoBatchRead() {
    const ids = readUndoRef.current;
    if (!ids || ids.length === 0) return;
    if (batchReadMutationRef.current.isPending) {
      showToast("已读状态正在保存，请稍候");
      return;
    }

    const idSet = new Set(ids);
    readUndoRef.current = null;
    if (readUndoTimer.current) clearTimeout(readUndoTimer.current);
    const result = await batchReadMutationRef.current.execute({
      optimistic: () => {
        setArticles((current) => current.map((article) => idSet.has(article.id) ? { ...article, read: false } : article));
      },
      persist: () => updateStoredArticlesStatus(ids, { read: false }),
      rollback: () => {
        setArticles((current) => current.map((article) => idSet.has(article.id) ? { ...article, read: true } : article));
        readUndoRef.current = ids;
      },
      onError: () => {
        readUndoTimer.current = setTimeout(() => { readUndoRef.current = null; }, 5000);
        showToastWithAction("撤销保存失败，文章仍保持已读", {
          label: "重试撤销",
          run: () => { void undoBatchRead(); },
        });
      },
    });

    if (result === "success") showToast("已撤销批量已读");
  }, [showToast, showToastWithAction]);

  const handleMarkAllRead = async () => {
    if (batchReadMutationRef.current.isPending) {
      showToast("已读状态正在保存，请稍候");
      return;
    }

    const idsToMarkRead = getUnreadArticleIds(visibleArticlesRef.current);
    if (idsToMarkRead.length === 0) {
      showToast("当前可见范围没有未读文章");
      return;
    }

    const visibleIdSet = new Set(idsToMarkRead);
    const result = await batchReadMutationRef.current.execute({
      optimistic: () => {
        setArticles((current) => current.map((article) => visibleIdSet.has(article.id) ? { ...article, read: true } : article));
      },
      persist: () => updateStoredArticlesStatus(idsToMarkRead, { read: true }),
      rollback: () => {
        setArticles((current) => current.map((article) => visibleIdSet.has(article.id) ? { ...article, read: false } : article));
      },
      onError: () => showToast("批量标记已读保存失败，已恢复原状态，请重试"),
    });

    if (result !== "success") return;
    readUndoRef.current = idsToMarkRead;
    if (readUndoTimer.current) clearTimeout(readUndoTimer.current);
    readUndoTimer.current = setTimeout(() => { readUndoRef.current = null; }, 5000);
    showToastWithAction(`已将当前可见范围的 ${idsToMarkRead.length} 篇文章标为已读`, {
      label: "撤销",
      run: () => { void handleUndoMarkAllRead(); },
    });
  };

  // Handler: OPML Import
  const handleImportOpmlFile = async (file: File) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const allOutlines = Array.from(xmlDoc.querySelectorAll("outline"));
      if (xmlDoc.querySelector("parsererror")) throw new Error("XML 格式无效");

      const importedFeeds: Feed[] = [];
      let invalidCount = 0;
      allOutlines.forEach((node, idx) => {
        const xmlUrl = node.getAttribute("xmlUrl");
        const title = node.getAttribute("title") || node.getAttribute("text") || `导入源 ${idx + 1}`;
        const parentCategory =
          node.parentElement?.getAttribute("title") ||
          node.parentElement?.getAttribute("text") ||
          "未分类";

        if (xmlUrl) {
          try {
            new URL(xmlUrl);
          } catch {
            invalidCount += 1;
            return;
          }
          importedFeeds.push({
            id: `opml-${Date.now()}-${idx}`,
            title,
            feedUrl: xmlUrl,
            siteUrl: node.getAttribute("htmlUrl") || xmlUrl,
            category: parentCategory,
            unreadCount: 0,
          });
        } else if (node.getAttribute("type") !== "folder") invalidCount += 1;
      });

      if (importedFeeds.length > 0) {
        const normalizedImportedFeeds = mergeDefaultFeedFields(importedFeeds);
        const existingUrls = new Set(feedsRef.current.map((f) => f.feedUrl.trim().toLowerCase()));
        const seenUrls = new Set<string>();
        const newOnly = normalizedImportedFeeds.filter((feed) => {
          const key = feed.feedUrl.trim().toLowerCase();
          if (existingUrls.has(key) || seenUrls.has(key)) return false;
          seenUrls.add(key);
          return true;
        });
        setFeeds((prev) => [...newOnly, ...prev]);
        setCategories((prev) => Array.from(new Set([...prev, ...newOnly.map((feed) => feed.category || "未分类")])));
        setPendingRefreshFeedIds(newOnly.map((feed) => feed.id));
        showToast(`OPML 导入：新增 ${newOnly.length}，重复 ${normalizedImportedFeeds.length - newOnly.length}，无效 ${invalidCount}`);
      } else {
        showToast(`OPML 导入：新增 0，重复 0，无效 ${invalidCount || allOutlines.length}`);
      }
    } catch (e: any) {
      showToast(`OPML 解析失败：${e.message || "未知错误"}`);
    }
  };

  // Keyboard Navigation Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveTab("search");
        setSelectedFeedId(null);
        setSelectedCategory(null);
        setSelectedArticleId(null);
        return;
      }
      // Ignore hotkeys when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "j" || e.key === "J") {
        // Next article
        const currentArticles = visibleArticlesRef.current;
        if (currentArticles.length > 0) {
          const currentIndex = selectedArticle
            ? currentArticles.findIndex((a) => a.id === selectedArticle.id)
            : -1;
          const nextIndex = Math.min(currentIndex + 1, currentArticles.length - 1);
          handleSelectArticle(currentArticles[nextIndex]);
        }
      } else if (e.key === "k" || e.key === "K") {
        // Previous article
        const currentArticles = visibleArticlesRef.current;
        if (currentArticles.length > 0) {
          const currentIndex = selectedArticle
            ? currentArticles.findIndex((a) => a.id === selectedArticle.id)
            : 0;
          const prevIndex = Math.max(currentIndex - 1, 0);
          handleSelectArticle(currentArticles[prevIndex]);
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
  }, [selectedArticle, articles, activeTab, filterType, searchQuery, selectedFeedId, selectedCategory]);

  // Totals
  const totalUnread = countRecentUnreadArticles(articles, Date.now());
  const totalSaved = articles.filter((a) => a.starred).length;
  // Compute Active Title
  const activeTitle = useMemo(() => {
    if (activeTab === "playlist") return "音频";
    if (activeTab === "notes") return "笔记";
    if (activeTab === "saved") return "收藏文章";
    if (activeTab === "search") return "搜索";
    if (activeTab === "settings") return "设置";
    if (activeTab === "feeds" && filterType === "starred" && !selectedFeedId && !selectedCategory) return "收藏";
    if (activeTab === "feeds" && !selectedFeedId && !selectedCategory) return "时间线";
    if (selectedFeedId) {
      const target = feeds.find((f) => f.id === selectedFeedId);
      return target ? target.title : "订阅文章";
    }
    if (selectedCategory) return selectedCategory.replace(/\s*\|\s*/g, " · ");
    return "全部订阅";
  }, [activeTab, filterType, selectedFeedId, selectedCategory, feeds, playlistArticles.length, visibleArticleNotes.length]);
  const activeCountLabel = useMemo(() => {
    if (activeTab === "playlist") return `${playlistArticles.length} 条`;
    if (activeTab === "notes") return `${visibleArticleNotes.length} 条`;
    if (activeTab === "feeds" && filterType === "starred" && !selectedFeedId && !selectedCategory) return `${totalSaved} 条`;
    return undefined;
  }, [activeTab, filterType, playlistArticles.length, selectedCategory, selectedFeedId, totalSaved, visibleArticleNotes.length]);
  const effectiveContentType = selectedFeedId ? "all" : contentType;
  const showTimelineFilters = activeTab === "feeds" && filterType !== "starred" && !selectedFeedId;

  // Compute Visible Articles according to current tab & filters
  const visibleArticles = useMemo(() => {
    const now = Date.now();

    if (activeTab === "search" && searchResultsReady) return searchVisibleArticles;

    const filteredArticles = articles.filter((article) => {
      if (activeTab === "search") {
        return matchesSearchQuery(article, searchQuery);
      }
      // 0. Feed lists load history in 30-day chunks.
      if (isRecencyLimitedTab(activeTab) && !isVisibleInHistoryWindow(article.pubDate, historyWindowDays, now)) {
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
      if (activeTab === "feeds") {
        if (filterType === "unread" && article.read) return false;
        if (filterType === "starred" && !article.starred) return false;
        if (filterType !== "starred" && effectiveContentType === "podcast" && !article.audioUrl?.trim()) return false;
        if (filterType !== "starred" && effectiveContentType === "article" && article.audioUrl?.trim()) return false;
      }

      // 4. Quick Header Search
      if (searchQuery.trim() && activeTab !== "search" && !matchesSearchQuery(article, searchQuery)) {
        return false;
      }

      return true;
    });
    if (activeTab !== "feeds") return filteredArticles;
    const sortedArticles = sortArticlesByPubDate(filteredArticles);
    return timelineSortOrder === "newest" ? sortedArticles : [...sortedArticles].reverse();
  }, [articles, activeTab, selectedFeedId, selectedCategory, filterType, effectiveContentType, searchQuery, feeds, historyWindowDays, localDayVersion, searchResultsReady, searchVisibleArticles, timelineSortOrder]);

  visibleArticlesRef.current = visibleArticles;

  const olderArticleCount = useMemo(() => {
    if (activeTab !== "feeds") return 0;
    return countOlderArticles(articles, feeds, selectedFeedId, selectedCategory, { filterType, contentType: effectiveContentType, searchQuery, historyWindowDays });
  }, [activeTab, articles, effectiveContentType, feeds, filterType, historyWindowDays, localDayVersion, searchQuery, selectedCategory, selectedFeedId]);

  useEffect(() => {
    if (activeTab !== "feeds") setFilterType("all");
    if (activeTab !== "search" && searchQuery) setSearchQuery("");
    if (activeTab !== "search") setSearchResultsReady(false);
  }, [activeTab, searchQuery]);

  const selectedIndex = selectedArticle
    ? visibleArticles.findIndex((a) => a.id === selectedArticle.id)
    : -1;
  const handleNextArticle = selectedIndex >= 0 && selectedIndex < visibleArticles.length - 1
    ? () => setSelectedArticleId(visibleArticles[selectedIndex + 1].id)
    : undefined;
  const handlePrevArticle = selectedIndex > 0
    ? () => setSelectedArticleId(visibleArticles[selectedIndex - 1].id)
    : undefined;

  const handleOpenSettings = useCallback(() => {
    readerScrollTopBeforeSettings.current = mainScrollRef.current?.scrollTop || 0;
    setSettingsInitialTab("feeds");
    setIsMobileMenuOpen(false);
    setIsSettingsOpen(true);
  }, []);

  const handleOpenAiSettings = useCallback(() => {
    readerScrollTopBeforeSettings.current = mainScrollRef.current?.scrollTop || 0;
    setSettingsInitialTab("insight");
    setIsMobileMenuOpen(false);
    setIsSettingsOpen(true);
  }, []);

  const handleOpenTranscriptionSettings = useCallback(() => {
    readerScrollTopBeforeSettings.current = mainScrollRef.current?.scrollTop || 0;
    setSettingsInitialTab("transcript");
    setIsMobileMenuOpen(false);
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setIsMobileMenuOpen(false);
    requestAnimationFrame(() => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = readerScrollTopBeforeSettings.current;
      }
    });
  }, []);

  const handleExportBackup = useCallback(async () => {
    try {
      const backup = await createDataBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wreader-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("备份已导出");
    } catch (error) {
      showToast(`备份导出失败：${error instanceof Error ? error.message : "请重试"}`);
    }
  }, [showToast]);

  const handleImportBackup = useCallback(async (file: File) => {
    try {
      const result = await restoreDataBackup(await file.text());
      const state = await getAppStateFromDB();
      setFeeds(result.feeds);
      setArticles(result.articles);
      setArticleNotes(result.notes);
      if (state?.categories) setCategories(state.categories);
      if (state?.feedOrderByFolder) setFeedOrderByFolder(state.feedOrderByFolder);
      if (state?.playlistIds) setPlaylistIds(state.playlistIds);
      if (state?.audioProgressMap) setAudioProgressMap(state.audioProgressMap);
      showToast(`已恢复备份：${result.feeds.length} 个订阅源、${result.articles.length} 篇文章`);
    } catch (error) {
      showToast(`备份恢复失败：${error instanceof Error ? error.message : "文件无效"}`);
    }
  }, [showToast]);

  const articleListView = (
    <ArticleList
      articles={visibleArticles}
      onSelectArticle={handleSelectArticle}
      onToggleStar={handleToggleStar}
      onToggleRead={handleToggleRead}
      onSummarizeAI={(article) => handleSelectArticle(article)}
      playlistIds={playablePlaylistIds}
      onTogglePlaylist={handleTogglePlaylist}
      olderArticleCount={olderArticleCount}
      historyWindowDays={historyWindowDays}
      historyWindowStepDays={HISTORY_WINDOW_STEP_DAYS}
      onShowOlder={() => navigateToRoute({ historyWindowDays: historyWindowDays + HISTORY_WINDOW_STEP_DAYS })}
      onHideOlder={() => navigateToRoute({ historyWindowDays: DEFAULT_HISTORY_WINDOW_DAYS })}
      selectedArticleId={selectedArticleId}
    />
  );

  const masterView = activeTab === "playlist" ? (
    <PlaylistView
      articles={playlistArticles}
      audioProgressMap={audioProgressMap}
      audioPlayer={audioPlayer}
      onSelectArticle={handleSelectArticle}
      onRemoveFromPlaylist={handleRemoveFromPlaylist}
      onClearPlaylist={handleClearPlaylist}
      onReorder={handleReorderPlaylist}
      onRemoveMany={handleRemoveManyFromPlaylist}
      isLoading={isInitializing}
      onNavigateFeeds={() => navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}
    />
  ) : activeTab === "notes" ? (
    <NotesView notes={visibleArticleNotes} articles={articles} onOpen={handleOpenNote} onUpdate={handleUpdateNote} onDelete={handleDeleteNote} />
  ) : activeTab === "search" ? (
    <SearchView
      articles={articles}
      feeds={feeds}
      searchQuery={searchQuery}
      setSearchQuery={(query) => {
        setSearchQuery(query);
        navigateToRoute({ activeTab: "search", searchQuery: query, articleId: selectedArticleId }, true);
      }}
      onSelectArticle={handleSelectArticle}
      onToggleStar={handleToggleStar}
      onToggleRead={handleToggleRead}
      onSummarizeAI={handleSelectArticle}
      onResultsChange={handleSearchResultsChange}
      selectedArticleId={selectedArticleId}
    />
  ) : articleListView;

  const detailView = selectedArticle ? (
    <ArticleDetailModal
      article={selectedArticle}
      onClose={closeArticle}
      onOpenNavigation={() => setIsMobileMenuOpen(true)}
      onToggleStar={handleToggleStar}
      onToggleRead={handleToggleRead}
      onNextArticle={handleNextArticle}
      onPrevArticle={handlePrevArticle}
      playlistIds={playablePlaylistIds}
      onTogglePlaylist={handleTogglePlaylist}
      savedProgress={audioProgressMap[selectedArticle.id]}
      audioPlayer={audioPlayer}
      autoPlay={autoPlayNextRef.current === selectedArticle.id}
      onAutoPlayStarted={() => { autoPlayNextRef.current = null; }}
      onArticlePatch={handleArticlePatch}
      savedReadingProgress={selectedArticle.readingProgress}
      savedScrollTop={detailScrollPositions.current[selectedArticle.id]}
      onScrollPositionChange={(articleId, scrollTop) => { detailScrollPositions.current[articleId] = scrollTop; }}
      onReadingProgressChange={handleUpdateReadingProgress}
      initialOpenTarget={detailOpenIntent}
      initialDetailTab={activeDetailTab}
      onDetailTabChange={(tab) => navigateToRoute({ detailTab: tab })}
      isImmersive={isImmersive}
      onToggleImmersive={() => setIsImmersive((immersive) => !immersive)}
      onOpenAiSettings={handleOpenAiSettings}
      onOpenTranscriptionSettings={handleOpenTranscriptionSettings}
    />
  ) : invalidArticleId ? (
    <div className="flex h-full items-center justify-center px-6 text-center"><div className="max-w-sm"><h2 className="text-base font-semibold text-slate-700">这篇文章暂时不可用</h2><p className="mt-2 text-sm leading-6 text-slate-500">文章可能已被删除或所属订阅源已取消。</p><button type="button" onClick={closeArticle} className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">返回列表</button></div></div>
  ) : activeTab === "playlist" ? (
    <div className="wreader-empty-detail wreader-playlist-empty-detail flex h-full flex-col items-center justify-center px-8 text-center text-slate-400"><Headphones className="wreader-playlist-detail-empty-icon" aria-hidden="true" /><h2>选择一个节目查看详情</h2><p>从中栏播放列表选择标题或封面，详情会显示在这里。</p></div>
  ) : (
    <div className="wreader-empty-detail flex h-full flex-col items-center justify-center px-8 text-center text-slate-400"><svg className="wreader-empty-detail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z" /><path d="M4 4.5v18M8 7h8M8 11h7" /></svg><h2>选择一篇文章开始阅读</h2><p>从左侧时间线选择文章，正文、概要和音频会显示在这里。</p><div className="wreader-empty-shortcuts">快捷键 <kbd>J</kbd> <kbd>K</kbd> 切换文章 · <kbd>⌘K</kbd> 搜索</div></div>
  );

  if (isInitializing) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-500">正在加载文章…</div>;
  }

  return (
    <div className={`wreader-app flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased transition-colors duration-200 ${isSidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <audio
        ref={audioPlayer.audioRef}
        className="hidden"
        onPlay={audioPlayer.handlePlay}
        onPause={audioPlayer.handlePause}
        onTimeUpdate={audioPlayer.handleTimeUpdate}
        onLoadedMetadata={audioPlayer.handleLoadedMetadata}
        onEnded={audioPlayer.handleEnded}
        onError={audioPlayer.handleAudioError}
      />
      {!isImmersive && <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filterType={filterType}
          feeds={feeds}
          categories={categories}
          selectedFeedId={selectedFeedId}
          setSelectedFeedId={setSelectedFeedId}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          totalUnread={totalUnread}
          totalSaved={totalSaved}
          playlistCount={0}
          notesCount={0}
          onOpenAddFeed={() => setIsAddFeedOpen(true)}
          onCreateFolder={handleAddCategory}
          onOpenSettings={handleOpenSettings}
          feedSortMode={feedSortMode}
          folderSortMode={folderSortMode}
          feedOrderByFolder={feedOrderByFolder}
          isMobileOpen={isMobileMenuOpen}
          setIsMobileOpen={setIsMobileMenuOpen}
          onNavigate={navigateToRoute}
          onRefresh={handleRefreshAllFeeds}
          isRefreshing={isRefreshing}
          isCollapsed={isSidebarCollapsed}
          onCollapse={isSettingsOpen ? undefined : () => {
            setIsSidebarCollapsed((collapsed) => !collapsed);
            setIsMobileMenuOpen(false);
          }}
        />}

      <div className="min-w-0 flex-1 overflow-hidden">
        {isImmersive ? (
          <main className="h-full bg-white">{detailView}</main>
        ) : (
          <div className="wreader-workspace-grid h-full" data-detail-open={Boolean(selectedArticle || invalidArticleId)}>
            <section className="wreader-master flex min-h-0 flex-col bg-[#fbfcfd]">
              <Header
          activeTab={activeTab}
          currentTitle={activeTitle}
          currentCountLabel={activeCountLabel}
          filterType={filterType}
          setFilterType={(nextFilter) => navigateToRoute({ activeTab: "feeds", filterType: nextFilter, articleId: null })}
          onRefresh={handleRefreshAllFeeds}
          onMarkAllRead={activeTab === "playlist" ? handleClearPlaylist : activeTab === "notes" ? handleClearNotes : activeTab === "feeds" && filterType === "starred" ? handleClearFavorites : handleMarkAllRead}
          notesEmpty={visibleArticleNotes.length === 0}
          playlistEmpty={playlistIds.length === 0}
          favoritesEmpty={totalSaved === 0}
          isRefreshing={isRefreshing}
          onToggleMobileMenu={() => {
            if (window.matchMedia("(min-width: 1280px)").matches) {
              setIsSidebarCollapsed(false);
              return;
            }
            setIsMobileMenuOpen((open) => !open);
          }}
          sidebarCollapsed={isSidebarCollapsed}
          onNavigateSearch={() => {
            navigateToRoute({ activeTab: "search", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined });
          }}
          unreadCount={visibleArticles.filter((a) => !a.read).length}
          showTimelineFilters={showTimelineFilters}
          contentType={effectiveContentType}
          onContentTypeChange={(nextContentType) => navigateToRoute({ activeTab: "feeds", contentType: nextContentType, articleId: null })}
          historyWindowDays={historyWindowDays}
          refreshProgress={{
            completed: refreshState.completed,
            total: refreshState.total,
            successful: refreshState.successful,
            failed: refreshState.failed.length,
            newArticles: refreshState.newArticles,
          }}
          lastSyncAt={refreshState.finishedAt}
          timelineSortOrder={activeTab === "playlist" ? playlistSortOrder : timelineSortOrder}
          onToggleTimelineSort={() => {
            if (activeTab === "playlist") {
              setPlaylistIds((ids) => [...ids].reverse());
              setPlaylistSortOrder((order) => order === "newest" ? "oldest" : "newest");
            } else setTimelineSortOrder((order) => order === "newest" ? "oldest" : "newest");
          }}
              />
              <main ref={mainScrollRef} className="wreader-master-scroll min-h-0 flex-1 overflow-y-auto scrollbar-thin">{masterView}</main>
            </section>
            <section className="wreader-detail min-h-0 overflow-hidden bg-white">{detailView}</section>
          </div>
        )}
      </div>

      {isSettingsOpen && !isImmersive && (
        <SettingsPage
          feeds={feeds}
          categories={categories}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onUpdateFeedCategory={handleUpdateFeedCategory}
          onUpdateFeedUrls={handleUpdateFeedUrls}
          onDeleteFeed={handleDeleteFeed}
          feedSortMode={feedSortMode}
          folderSortMode={folderSortMode}
          onFeedSortModeChange={setFeedSortMode}
          onFolderSortModeChange={setFolderSortMode}
          feedOrderByFolder={feedOrderByFolder}
          onReorderFolderFeeds={handleReorderFolderFeeds}
          onReorderCategories={handleReorderCategories}
          onBack={handleCloseSettings}
          onOpenAddFeed={() => setIsAddFeedOpen(true)}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          initialTab={settingsInitialTab}
        />
      )}

      {!isImmersive && activeTab !== "settings" && !selectedArticle && !invalidArticleId && (
        <nav className="wreader-mobile-tabs" aria-label="移动端阅读入口">
          <button type="button" className={activeTab === "feeds" && filterType !== "starred" && !selectedFeedId && !selectedCategory ? "is-active" : ""} onClick={() => navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2" /></svg><span>时间线</span></button>
          <button type="button" className={activeTab === "search" ? "is-active" : ""} onClick={() => navigateToRoute({ activeTab: "search", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg><span>搜索</span></button>
          <button type="button" className={activeTab === "feeds" && filterType === "starred" ? "is-active" : ""} onClick={() => navigateToRoute({ activeTab: "feeds", filterType: "starred", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" /></svg><span>收藏</span></button>
          <button type="button" aria-expanded={isMobileMenuOpen} aria-controls="inoreader-sidebar" onClick={() => setIsMobileMenuOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg><span>更多</span></button>
        </nav>
      )}

      {/* Add Feed Subscription Center Modal */}
      <AddFeedModal
        isOpen={isAddFeedOpen}
        onClose={() => setIsAddFeedOpen(false)}
        existingFeeds={feeds}
        onAddFeed={handleAddFeed}
        onImportOpmlFile={handleImportOpmlFile}
      />

      {/* Keyboard Hotkeys Reference */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
      {/* Global transient feedback: one predictable top-center stack across the app. */}
      <div className="wreader-toast-stack" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className="wreader-toast" role="status">
            <span>{toast.message}</span>
            {toast.action && (
              <button type="button" onClick={toast.action.run} className="wreader-toast-action">
                {toast.action.label}
              </button>
            )}
          </div>
        )}
        {refreshFeedback && (
          <section className={`wreader-toast wreader-refresh-feedback ${refreshFeedback === "failure" ? "is-error" : ""}`} role="status">
            {refreshFeedback === "success" ? <span>同步完成：已更新 {refreshState.successful} 个订阅源，发现 {refreshState.newArticles} 篇新内容。</span> : <>
              <span>{refreshState.failed.length} 个订阅源同步失败</span>
              <button type="button" onClick={() => setIsRefreshFailureDetailsOpen((open) => !open)} aria-expanded={isRefreshFailureDetailsOpen}>{isRefreshFailureDetailsOpen ? "收起" : "查看"}</button>
              <button type="button" onClick={() => void handleRefreshAllFeeds(refreshState.failed.map((feed) => feed.id))}>重试</button>
              <button type="button" className="toast-close" onClick={() => { setRefreshFeedback(null); setIsRefreshFailureDetailsOpen(false); }} aria-label="关闭同步失败提示">关闭</button>
            </>}
          </section>
        )}
        {refreshFeedback === "failure" && isRefreshFailureDetailsOpen && (
          <section className="wreader-refresh-failure-panel" aria-label="刷新失败详情">
            <div className="wreader-failure-heading"><strong>刷新失败详情</strong><button type="button" onClick={() => setIsRefreshFailureDetailsOpen(false)} aria-label="关闭失败详情"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
            <p>以下订阅源未能更新，可逐个重试。</p>
            <div className="wreader-failure-list">{refreshState.failed.map((feed) => <div key={feed.id}><span title={feed.lastSyncError}>{feed.title}</span><button type="button" onClick={() => void handleRetryFeed(feed.id)}>重试</button></div>)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
