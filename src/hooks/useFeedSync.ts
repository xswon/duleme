import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Article, AudioProgress, Feed } from "../types";
import { resolveFeedEnrichmentSource } from "../services/feedEnrichment";
import {
  attachBidclubSelfReferences,
  backfillArticleBidclubReferences,
  fetchRssFeed,
  RssFeedRequestError,
  isBidclubFeedUrl,
  matchBidclubItems,
  mergeFetchedFeedArticles,
  migrateArticleBackrefs,
  migrateAudioProgressMap,
  replaceStoredArticlesForFeedsAndMigrateReferences,
  updateStoredArticleStatus,
} from "../services/rssService";

export interface FeedRefreshState {
  completed: number;
  total: number;
  successful: number;
  failed: Feed[];
  newArticles: number;
  startedAt?: number;
  finishedAt?: number;
  mode: "refresh" | "retry" | "background";
  criticalFailure: boolean;
}

interface UseFeedSyncOptions {
  feeds: Feed[];
  setFeeds: Dispatch<SetStateAction<Feed[]>>;
  feedsRef: MutableRefObject<Feed[]>;
  articles: Article[];
  setArticles: Dispatch<SetStateAction<Article[]>>;
  articlesRef: MutableRefObject<Article[]>;
  playlistIdsRef: MutableRefObject<string[]>;
  audioProgressMapRef: MutableRefObject<Record<string, AudioProgress>>;
  commitArticleIdMigration: (articleIdMap: Map<string, string>, playlistIds: string[], audioProgressMap: Record<string, AudioProgress>) => void;
  setSelectedArticleId: Dispatch<SetStateAction<string | null>>;
  isInitializing: boolean;
  isAppStateReady: boolean;
  showToast: (message: string) => void;
}

type PendingRefreshRequest = { feedIds: string[]; mode: FeedRefreshState["mode"] };

const BACKGROUND_RETRY_DELAYS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

const EMPTY_REFRESH_STATE: FeedRefreshState = {
  completed: 0,
  total: 0,
  successful: 0,
  failed: [],
  newArticles: 0,
  mode: "refresh",
  criticalFailure: false,
};

function successfulFeed(feed: Feed, patch: Partial<Feed> = {}): Feed {
  const now = new Date().toISOString();
  return {
    ...feed,
    ...patch,
    lastUpdated: now,
    lastSyncAttemptAt: now,
    lastSyncStatus: "success",
    lastSyncError: undefined,
    syncFailureCount: 0,
    nextSyncRetryAt: undefined,
  };
}

function failedFeed(feed: Feed, error: unknown, message: string): Feed {
  const failureCount = (feed.syncFailureCount || 0) + 1;
  const retryable = error instanceof RssFeedRequestError && error.retryable;
  const retryDelay = BACKGROUND_RETRY_DELAYS_MS[Math.min(failureCount - 1, BACKGROUND_RETRY_DELAYS_MS.length - 1)];
  return {
    ...feed,
    lastSyncStatus: "error",
    lastSyncError: message,
    lastSyncAttemptAt: new Date().toISOString(),
    syncFailureCount: failureCount,
    nextSyncRetryAt: retryable ? new Date(Date.now() + retryDelay).toISOString() : undefined,
  };
}

export function useFeedSync(options: UseFeedSyncOptions) {
  const {
    feeds, setFeeds, feedsRef, articles, setArticles, articlesRef,
    playlistIdsRef, audioProgressMapRef, commitArticleIdMigration,
    setSelectedArticleId, isInitializing, isAppStateReady, showToast,
  } = options;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshState, setRefreshState] = useState<FeedRefreshState>(EMPTY_REFRESH_STATE);
  const [pendingRefresh, setPendingRefresh] = useState<PendingRefreshRequest | null>(null);
  const refreshGeneration = useRef(0);
  const refreshInFlight = useRef(false);

  const invalidateRefresh = useCallback(() => { refreshGeneration.current += 1; }, []);
  const queueRefresh = useCallback((feedIds: string[]) => setPendingRefresh({ feedIds, mode: "refresh" }), []);

  const refreshAll = useCallback(async (requestedFeedIds?: string[], mode: FeedRefreshState["mode"] = "refresh") => {
    const generation = refreshGeneration.current;
    const requestedIds = Array.isArray(requestedFeedIds) ? requestedFeedIds : undefined;
    const sourceFeeds = feedsRef.current.filter((feed) => !requestedIds || requestedIds.includes(feed.id));
    if (sourceFeeds.length === 0) return;
    if (refreshInFlight.current) {
      if (mode === "retry" && requestedIds?.length) {
        setPendingRefresh({ feedIds: requestedIds, mode });
        showToast("当前同步完成后将自动重试");
      } else if (mode === "background" && requestedIds?.length) {
        setPendingRefresh((current) => current ?? { feedIds: requestedIds, mode });
      }
      return;
    }
    refreshInFlight.current = true;
    setIsRefreshing(true);
    setRefreshState({ ...EMPTY_REFRESH_STATE, total: sourceFeeds.length, startedAt: Date.now(), mode });
    try {
      const results: Array<{ feed: Feed; articles: Article[]; feedIcon?: string } | null> = new Array(sourceFeeds.length).fill(null);
      let nextFeedIndex = 0;
      const worker = async () => {
        while (nextFeedIndex < sourceFeeds.length) {
          const index = nextFeedIndex++;
          const feed = sourceFeeds[index];
          try {
            const parsed = await fetchRssFeed(feed.feedUrl);
            const feedIcon = parsed.feedImage || parsed.favicon || feed.favicon;
            const parsedItems = feed.enrichmentDisabled !== true && isBidclubFeedUrl(feed.feedUrl) ? attachBidclubSelfReferences(parsed.items) : parsed.items;
            const bidclubFeedUrl = resolveFeedEnrichmentSource(feed).bidclubFeedUrl;
            const bidclubData = bidclubFeedUrl
              ? await fetchRssFeed(bidclubFeedUrl).catch((error) => {
                  console.warn(`Failed to sync BidClub helper feed for ${feed.title}:`, error);
                  return null;
                })
              : null;
            const matchResult = bidclubData ? matchBidclubItems(parsedItems, bidclubData.items) : null;
            if (matchResult) console.info(`BidClub sync summary: ${feed.title}`, matchResult.diagnostics);
            results[index] = {
              feed,
              feedIcon,
              articles: (matchResult?.items || parsedItems || []).map((item) => ({
                ...item, feedId: feed.id, feedTitle: feed.title, feedFavicon: feedIcon, read: false, starred: false,
              })),
            };
            if (refreshGeneration.current !== generation) continue;
            setFeeds((current) => current.map((item) => item.id === feed.id ? successfulFeed(item) : item));
            setRefreshState((state) => ({ ...state, completed: state.completed + 1, successful: state.successful + 1 }));
          } catch (error) {
            const message = error instanceof Error ? error.message : "同步失败";
            console.warn(`Failed to sync feed ${feed.title}:`, error);
            if (refreshGeneration.current !== generation) continue;
            const failed = failedFeed(feed, error, message);
            setFeeds((current) => current.map((item) => item.id === feed.id ? failed : item));
            setRefreshState((state) => ({ ...state, completed: state.completed + 1, failed: [...state.failed, failed] }));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, sourceFeeds.length) }, () => worker()));
      if (refreshGeneration.current !== generation) return;

      const successfulResults = results.filter((result): result is NonNullable<typeof result> => !!result);
      const fetchedNewArticles = successfulResults.flatMap((result) => result.articles);
      const existingIds = new Set(articlesRef.current.map((article) => article.id));
      const newArticleCount = fetchedNewArticles.filter((article) => !existingIds.has(article.id)).length;
      setRefreshState((state) => ({ ...state, newArticles: newArticleCount, finishedAt: Date.now() }));
      const currentFeedIds = new Set(feedsRef.current.map((feed) => feed.id));
      const refreshedFeedIds = new Set(successfulResults.map((result) => result.feed.id).filter((id) => currentFeedIds.has(id)));
      const updatedIcons = new Map(successfulResults
        .filter((result) => result.feedIcon && result.feedIcon !== result.feed.favicon)
        .map((result) => [result.feed.id, result.feedIcon!]));
      if (updatedIcons.size > 0) setFeeds((current) => current.map((feed) => {
        const favicon = updatedIcons.get(feed.id);
        return favicon ? { ...feed, favicon } : feed;
      }));

      if (refreshedFeedIds.size > 0) {
        const merged = mergeFetchedFeedArticles(articlesRef.current, fetchedNewArticles, refreshedFeedIds);
        const nextPlaylistIds = migrateArticleBackrefs(playlistIdsRef.current, merged.articleIdMap);
        const nextAudioProgressMap = migrateAudioProgressMap(audioProgressMapRef.current, merged.articleIdMap);
        try {
          await replaceStoredArticlesForFeedsAndMigrateReferences(
            refreshedFeedIds,
            merged.articles.filter((article) => refreshedFeedIds.has(article.feedId)),
            merged.articleIdMap,
            { playlistIds: nextPlaylistIds },
          );
          commitArticleIdMigration(merged.articleIdMap, nextPlaylistIds, nextAudioProgressMap);
        } catch (error) {
          const message = error instanceof Error ? error.message : "本地保存失败";
          const failedFeeds = successfulResults.map((result) => failedFeed(result.feed, error, `本地保存失败：${message}`));
          setFeeds((current) => current.map((feed) => failedFeeds.find((item) => item.id === feed.id) || feed));
          setRefreshState((state) => ({
            ...state,
            successful: Math.max(0, state.successful - failedFeeds.length),
            failed: [...state.failed, ...failedFeeds],
            newArticles: 0,
            finishedAt: Date.now(),
            criticalFailure: true,
          }));
          showToast(`同步内容保存失败：${message}`);
          return;
        }
        articlesRef.current = merged.articles;
        setArticles(merged.articles);
        setSelectedArticleId((previous) => {
          if (!previous) return previous;
          const targetId = merged.articleIdMap.get(previous) || previous;
          return merged.articles.some((article) => article.id === targetId) ? targetId : null;
        });
      }
    } finally {
      refreshInFlight.current = false;
      setIsRefreshing(false);
      setRefreshState((state) => ({ ...state, finishedAt: state.finishedAt || Date.now() }));
    }
  }, [articlesRef, audioProgressMapRef, commitArticleIdMigration, feedsRef, playlistIdsRef, setArticles, setFeeds, setSelectedArticleId, showToast]);

  const retryFeed = useCallback(async (feedId: string) => {
    const feed = feedsRef.current.find((item) => item.id === feedId);
    const generation = refreshGeneration.current;
    if (!feed) return;
    if (refreshInFlight.current) {
      setPendingRefresh({ feedIds: [feedId], mode: "retry" });
      showToast("当前同步完成后将自动重试");
      return;
    }
    refreshInFlight.current = true;
    setIsRefreshing(true);
    setRefreshState({ ...EMPTY_REFRESH_STATE, total: 1, failed: [feed], startedAt: Date.now(), mode: "retry" });
    try {
      const parsed = await fetchRssFeed(feed.feedUrl);
      const parsedItems = feed.enrichmentDisabled !== true && isBidclubFeedUrl(feed.feedUrl) ? attachBidclubSelfReferences(parsed.items) : parsed.items;
      const bidclubFeedUrl = resolveFeedEnrichmentSource(feed).bidclubFeedUrl;
      const helper = bidclubFeedUrl ? await fetchRssFeed(bidclubFeedUrl).catch(() => null) : null;
      if (refreshGeneration.current !== generation || !feedsRef.current.some((item) => item.id === feedId)) return;
      const matched = helper ? matchBidclubItems(parsedItems, helper.items).items : parsedItems;
      const refreshed = (matched || []).map((item) => ({
        ...item, feedId: feed.id, feedTitle: feed.title, feedFavicon: parsed.feedImage || parsed.favicon || feed.favicon, read: false, starred: false,
      }));
      const existingIds = new Set(articlesRef.current.map((article) => article.id));
      const newArticleCount = refreshed.filter((article) => !existingIds.has(article.id)).length;
      const merged = mergeFetchedFeedArticles(articlesRef.current, refreshed, new Set([feed.id]));
      const nextPlaylistIds = migrateArticleBackrefs(playlistIdsRef.current, merged.articleIdMap);
      const nextAudioProgressMap = migrateAudioProgressMap(audioProgressMapRef.current, merged.articleIdMap);
      try {
        await replaceStoredArticlesForFeedsAndMigrateReferences(
          new Set([feed.id]),
          merged.articles.filter((article) => article.feedId === feed.id),
          merged.articleIdMap,
          { playlistIds: nextPlaylistIds },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "本地保存失败";
        const failed = failedFeed(feed, error, `本地保存失败：${message}`);
        setFeeds((current) => current.map((item) => item.id === feed.id ? failed : item));
        setRefreshState({ completed: 1, total: 1, successful: 0, failed: [failed], newArticles: 0, startedAt: Date.now(), finishedAt: Date.now(), mode: "retry", criticalFailure: true });
        showToast(`同步内容保存失败：${message}`);
        return;
      }
      commitArticleIdMigration(merged.articleIdMap, nextPlaylistIds, nextAudioProgressMap);
      articlesRef.current = merged.articles;
      setArticles(merged.articles);
      setSelectedArticleId((previous) => previous ? merged.articleIdMap.get(previous) || previous : previous);
      setFeeds((current) => current.map((item) => item.id === feed.id ? successfulFeed(item) : item));
      setRefreshState({ completed: 1, total: 1, successful: 1, failed: [], newArticles: newArticleCount, startedAt: Date.now(), finishedAt: Date.now(), mode: "retry", criticalFailure: false });
      showToast(`已重试「${feed.title}」`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      const failed = failedFeed(feed, error, message);
      setFeeds((current) => current.map((item) => item.id === feed.id ? failed : item));
      setRefreshState({ completed: 1, total: 1, successful: 0, failed: [failed], newArticles: 0, startedAt: Date.now(), finishedAt: Date.now(), mode: "retry", criticalFailure: false });
      showToast(`「${feed.title}」重试失败，可稍后再试`);
    } finally {
      refreshInFlight.current = false;
      setIsRefreshing(false);
    }
  }, [articlesRef, audioProgressMapRef, commitArticleIdMigration, feedsRef, playlistIdsRef, setArticles, setFeeds, setSelectedArticleId, showToast]);

  useEffect(() => {
    if (!pendingRefresh || isRefreshing) return;
    const request = pendingRefresh;
    setPendingRefresh(null);
    void refreshAll(request.feedIds, request.mode);
  }, [isRefreshing, pendingRefresh, refreshAll]);

  useEffect(() => {
    const scheduled = feeds.flatMap((feed) => {
      if (feed.lastSyncStatus !== "error" || !feed.nextSyncRetryAt) return [];
      const retryAt = new Date(feed.nextSyncRetryAt).getTime();
      return Number.isFinite(retryAt) ? [{ feedId: feed.id, retryAt }] : [];
    });
    if (scheduled.length === 0) return;
    const earliest = Math.min(...scheduled.map((item) => item.retryAt));
    const timer = setTimeout(() => {
      const now = Date.now();
      const dueFeedIds = scheduled.filter((item) => item.retryAt <= now + 1_000).map((item) => item.feedId);
      if (dueFeedIds.length > 0) void refreshAll(dueFeedIds, "background");
    }, Math.max(0, earliest - Date.now()));
    return () => clearTimeout(timer);
  }, [feeds, refreshAll]);

  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (hasAutoRefreshed.current || isInitializing || !isAppStateReady) return;
    hasAutoRefreshed.current = true;
    void refreshAll();
  }, [isAppStateReady, isInitializing, refreshAll]);

  const bidclubRepairInFlight = useRef("");
  const completedBidclubRepairFingerprint = useRef("");
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);
  const bidclubFeedConfigFingerprint = useMemo(() => JSON.stringify(
    feeds
      .filter((feed) => !!resolveFeedEnrichmentSource(feed).bidclubFeedUrl)
      .map((feed) => `${feed.id}:${resolveFeedEnrichmentSource(feed).bidclubFeedUrl}`)
      .sort(),
  ), [feeds]);

  useEffect(() => {
    if (isInitializing || articles.length === 0) return;
    const repairFeedIds = new Set(feeds.filter((feed) => feed.enrichmentDisabled !== true && (!!resolveFeedEnrichmentSource(feed).bidclubFeedUrl || isBidclubFeedUrl(feed.feedUrl))).map((feed) => feed.id));
    const repairableIds = articles.filter((article) => repairFeedIds.has(article.feedId) && article.enrichment?.status !== "available")
      .map((article) => `${article.feedId}:${article.id}`).sort();
    if (repairableIds.length === 0) return;
    const helperUrls = feeds.flatMap((feed) => feed.enrichmentDisabled === true ? [] : [resolveFeedEnrichmentSource(feed).bidclubFeedUrl, isBidclubFeedUrl(feed.feedUrl) ? feed.feedUrl : undefined]).filter(Boolean).sort();
    const fingerprint = JSON.stringify([repairableIds, helperUrls]);
    const generation = refreshGeneration.current;
    const inFlightKey = JSON.stringify([generation, fingerprint]);
    if (bidclubRepairInFlight.current === inFlightKey || completedBidclubRepairFingerprint.current === inFlightKey) return;
    bidclubRepairInFlight.current = inFlightKey;
    void (async () => {
      try {
        const result = await backfillArticleBidclubReferences(articles, feeds);
        if (isMounted.current && generation === refreshGeneration.current && result.changed) {
          const currentFeeds = new Map(feedsRef.current.map((feed) => [feed.id, feed]));
          const fetchedFeeds = new Map(feeds.map((feed) => [feed.id, feed]));
          const enrichmentById = new Map(result.articles.filter((article) => {
            const current = currentFeeds.get(article.feedId);
            const fetched = fetchedFeeds.get(article.feedId);
            return !!article.enrichment && !!current && !!fetched && current.enrichmentDisabled !== true &&
              current.feedUrl === fetched.feedUrl &&
              resolveFeedEnrichmentSource(current).bidclubFeedUrl === resolveFeedEnrichmentSource(fetched).bidclubFeedUrl;
          }).map((article) => [article.id, article.enrichment!]));
          await Promise.all(Array.from(enrichmentById, ([articleId, enrichment]) => updateStoredArticleStatus(articleId, { enrichment })));
          if (isMounted.current && generation === refreshGeneration.current) {
            const committed = articlesRef.current.map((article) => {
              const enrichment = enrichmentById.get(article.id);
              return enrichment ? { ...article, enrichment } : article;
            });
            articlesRef.current = committed;
            setArticles(committed);
          }
        }
        if (result.failedFeedUrls.length === 0 && generation === refreshGeneration.current) completedBidclubRepairFingerprint.current = inFlightKey;
        console.info("BidClub repair summary", result.diagnostics);
      } catch (error) {
        console.warn("Failed to repair BidClub helper feeds:", error);
        if (isMounted.current) showToast("节目内容补全保存失败，请稍后重试");
      } finally {
        if (bidclubRepairInFlight.current === inFlightKey) bidclubRepairInFlight.current = "";
      }
    })();
  }, [articles, articlesRef, bidclubFeedConfigFingerprint, feeds, feedsRef, isInitializing, setArticles, showToast]);

  return { isRefreshing, refreshState, refreshAll, retryFeed, queueRefresh, invalidateRefresh };
}
