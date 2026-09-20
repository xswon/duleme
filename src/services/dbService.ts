import { AiConfig, Article, ArticleNote, Feed } from "../types";

const DB_NAME = "WReaderDB";
const DB_VERSION = 4;
const STORE_ARTICLES = "articles";
const STORE_FEEDS = "feeds";
const STORE_NOTES = "notes";
const STORE_SETTINGS = "settings";
const STORE_SECRETS = "secrets";
export const NOTES_CHANGED_EVENT = "wreader:notes-changed";

let dbPromise: Promise<IDBDatabase> | null = null;

function notifyNotesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
}

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
        const articleStore = db.createObjectStore(STORE_ARTICLES, { keyPath: "id" });
        articleStore.createIndex("feedId", "feedId", { unique: false });
        articleStore.createIndex("starred", "starred", { unique: false });
        articleStore.createIndex("read", "read", { unique: false });
        articleStore.createIndex("pubDate", "pubDate", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_FEEDS)) {
        db.createObjectStore(STORE_FEEDS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const noteStore = db.createObjectStore(STORE_NOTES, { keyPath: "id" });
        noteStore.createIndex("articleId", "articleId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SECRETS)) {
        db.createObjectStore(STORE_SECRETS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("IndexedDB open error:", request.error);
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

export interface PersistedAppState {
  categories?: string[];
  feedOrderByFolder?: Record<string, string[]>;
  playlistIds?: string[];
  audioProgressMap?: Record<string, { currentTime: number; duration: number; updatedAt: number }>;
  aiConfig?: AiConfig;
}

export async function getFeedsFromDB(): Promise<Feed[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_FEEDS, "readonly").objectStore(STORE_FEEDS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function replaceFeedsInDB(feeds: Feed[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEEDS, "readwrite");
    const store = tx.objectStore(STORE_FEEDS);
    store.clear();
    feeds.forEach((feed) => store.put(feed));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to save subscriptions"));
  });
}

export async function getAppStateFromDB(): Promise<PersistedAppState | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_SETTINGS, "readonly").objectStore(STORE_SETTINGS).get("app");
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAppStateToDB(value: PersistedAppState): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readwrite");
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.get("app");
    request.onsuccess = () => {
      const existing = (request.result?.value || {}) as PersistedAppState;
      store.put({ key: "app", value: { ...existing, ...value } });
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to save app state"));
  });
}

export async function getSecretFromDB<T>(key: string): Promise<T | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_SECRETS, "readonly").objectStore(STORE_SECRETS).get(key);
    request.onsuccess = () => resolve((request.result?.value as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSecretToDB<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SECRETS, "readwrite");
    tx.objectStore(STORE_SECRETS).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to save secret"));
  });
}

export async function deleteSecretFromDB(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SECRETS, "readwrite");
    tx.objectStore(STORE_SECRETS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to delete secret"));
  });
}

export async function migrateFeedsAndAppStateFromLocalStorageIfNeeded(
  legacyFeeds: Feed[],
  legacyState: PersistedAppState,
): Promise<{ feeds: Feed[]; state: PersistedAppState }> {
  const existingFeeds = await getFeedsFromDB();
  const existingState = await getAppStateFromDB();
  if (existingFeeds.length > 0 || existingState) {
    return { feeds: existingFeeds, state: existingState || legacyState };
  }
  await replaceFeedsInDB(legacyFeeds);
  await saveAppStateToDB(legacyState);
  const verifiedFeeds = await getFeedsFromDB();
  const verifiedState = await getAppStateFromDB();
  if (verifiedFeeds.length !== legacyFeeds.length || !verifiedState) {
    throw new Error("IndexedDB subscription migration verification failed");
  }
  return { feeds: verifiedFeeds, state: verifiedState };
}

interface DataBackupPayload {
  feeds: Feed[];
  articles: Article[];
  notes: ArticleNote[];
  appState: PersistedAppState | null;
}

export interface WReaderBackup {
  version: 1;
  createdAt: string;
  checksum: string;
  data: DataBackupPayload;
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function createDataBackup(): Promise<WReaderBackup> {
  const [feeds, articles, notes, appState] = await Promise.all([
    getFeedsFromDB(),
    getAllArticlesFromDB(),
    getAllArticleNotesFromDB(),
    getAppStateFromDB(),
  ]);
  const data = { feeds, articles, notes, appState };
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    checksum: checksum(JSON.stringify(data)),
    data,
  };
}

export async function restoreDataBackup(raw: string): Promise<{ feeds: Feed[]; articles: Article[]; notes: ArticleNote[] }> {
  const backup = JSON.parse(raw) as Partial<WReaderBackup>;
  if (backup.version !== 1 || !backup.data || !backup.checksum) throw new Error("备份版本不受支持");
  const serialized = JSON.stringify(backup.data);
  if (checksum(serialized) !== backup.checksum) throw new Error("备份校验失败，文件可能已损坏");
  const data = backup.data as DataBackupPayload;
  if (!Array.isArray(data.feeds) || !Array.isArray(data.articles) || !Array.isArray(data.notes)) throw new Error("备份内容不完整");
  const currentAppState = await getAppStateFromDB();
  const normalizeEndpoint = (value?: string) => (value || "").trim().replace(/\/+$/, "");
  const currentEndpoint = normalizeEndpoint(currentAppState?.aiConfig?.baseURL);
  const restoredEndpoint = normalizeEndpoint(data.appState?.aiConfig?.baseURL);
  const canReuseCurrentAiSecret = Boolean(currentEndpoint && restoredEndpoint && currentEndpoint === restoredEndpoint);

  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FEEDS, STORE_ARTICLES, STORE_NOTES, STORE_SETTINGS, STORE_SECRETS], "readwrite");
    tx.objectStore(STORE_FEEDS).clear();
    tx.objectStore(STORE_ARTICLES).clear();
    tx.objectStore(STORE_NOTES).clear();
    tx.objectStore(STORE_SETTINGS).clear();
    if (!canReuseCurrentAiSecret) tx.objectStore(STORE_SECRETS).delete("ai");
    data.feeds.forEach((feed) => tx.objectStore(STORE_FEEDS).put(feed));
    data.articles.forEach((article) => tx.objectStore(STORE_ARTICLES).put(article));
    data.notes.forEach((note) => tx.objectStore(STORE_NOTES).put(note));
    if (data.appState) tx.objectStore(STORE_SETTINGS).put({ key: "app", value: data.appState });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("备份恢复失败"));
  });
  const [verifiedFeeds, verifiedArticles, verifiedNotes] = await Promise.all([
    getFeedsFromDB(), getAllArticlesFromDB(), getAllArticleNotesFromDB(),
  ]);
  if (verifiedFeeds.length !== data.feeds.length || verifiedArticles.length !== data.articles.length || verifiedNotes.length !== data.notes.length) {
    throw new Error("备份恢复校验失败");
  }
  return { feeds: verifiedFeeds, articles: verifiedArticles, notes: verifiedNotes };
}

/** Return one article's excerpts in their creation order. */
export async function getArticleNotesFromDB(articleId: string): Promise<ArticleNote[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readonly");
    const request = tx.objectStore(STORE_NOTES).index("articleId").getAll(articleId);
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
  });
}

export async function getAllArticleNotesFromDB(): Promise<ArticleNote[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NOTES, "readonly").objectStore(STORE_NOTES).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}

/** Create or replace a persisted excerpt/note. */
export async function saveArticleNoteToDB(note: ArticleNote): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    tx.objectStore(STORE_NOTES).put(note);
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteArticleNoteFromDB(noteId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    tx.objectStore(STORE_NOTES).delete(noteId);
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a set of article notes atomically. */
export async function deleteArticleNotesFromDB(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    const store = tx.objectStore(STORE_NOTES);
    noteIds.forEach((noteId) => store.delete(noteId));
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to delete notes"));
  });
}

/** Repoint persisted notes when a refreshed feed gives an article a new canonical ID. */
export async function migrateArticleNoteIdsInDB(articleIdMap: Map<string, string>): Promise<void> {
  if (articleIdMap.size === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    const store = tx.objectStore(STORE_NOTES);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const note = cursor.value as ArticleNote;
      const articleId = articleIdMap.get(note.articleId);
      if (articleId && articleId !== note.articleId) {
        cursor.update({ ...note, articleId });
      }
      cursor.continue();
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to migrate article note references"));
  });
}

/** Close the cached connection, primarily for explicit app/test lifecycle cleanup. */
export async function closeDB(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  const db = await pending;
  db.close();
}

/** Get all stored articles from IndexedDB */
export async function getAllArticlesFromDB(): Promise<Article[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readonly");
      const store = tx.objectStore(STORE_ARTICLES);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
}

/** Save or update multiple articles in IndexedDB */
export async function saveArticlesToDB(articles: Article[]): Promise<void> {
  if (!articles || articles.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readwrite");
      const store = tx.objectStore(STORE_ARTICLES);

      articles.forEach((article) => {
        store.put(article);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
}

/**
 * Replace the persisted snapshot for successfully refreshed feeds.
 *
 * A refresh can migrate an episode to a new canonical ID. Plain `put` calls
 * leave the old key behind, so the legacy copy reappears on the next reload and
 * can open without its enrichment reference. Deleting and writing in the same
 * transaction keeps the refreshed feed snapshot consistent.
 */
export async function replaceArticlesForFeedsInDB(
  feedIds: Iterable<string>,
  articles: Article[]
): Promise<void> {
  const ids = Array.from(new Set(feedIds));
  if (ids.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, "readwrite");
    const store = tx.objectStore(STORE_ARTICLES);
    const index = store.index("feedId");
    const keysToDelete: IDBValidKey[] = [];
    let pendingKeyRequests = ids.length;

    const writeReplacement = () => {
      keysToDelete.forEach((key) => store.delete(key));
      articles.forEach((article) => store.put(article));
    };

    ids.forEach((feedId) => {
      const request = index.getAllKeys(IDBKeyRange.only(feedId));
      request.onsuccess = () => {
        keysToDelete.push(...request.result);
        pendingKeyRequests -= 1;
        if (pendingKeyRequests === 0) writeReplacement();
      };
      request.onerror = () => tx.abort();
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to replace refreshed articles"));
  });
}

/** Incrementally update a single article's properties (e.g. read / starred) */
export async function updateArticleInDB(articleId: string, updates: Partial<Article>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readwrite");
      const store = tx.objectStore(STORE_ARTICLES);
      const getReq = store.get(articleId);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          reject(new Error(`Article not found: ${articleId}`));
          return;
        }
        store.put({ ...existing, ...updates });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
}

/**
 * Update multiple articles as one atomic operation. If any requested article is
 * missing, or any request fails, the whole transaction is aborted so callers
 * never observe a partially-applied batch.
 */
export async function updateArticlesInDB(
  articleIds: Iterable<string>,
  updates: Partial<Article>
): Promise<void> {
  const ids = Array.from(new Set(articleIds));
  if (ids.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, "readwrite");
    const store = tx.objectStore(STORE_ARTICLES);
    let failure: Error | null = null;

    const abort = (error: Error) => {
      if (!failure) failure = error;
      try {
        tx.abort();
      } catch {
        // The transaction may already be aborting because of a request error.
      }
    };

    ids.forEach((articleId) => {
      const request = store.get(articleId);
      request.onsuccess = () => {
        if (failure) return;
        const existing = request.result as Article | undefined;
        if (!existing) {
          abort(new Error(`Article not found: ${articleId}`));
          return;
        }

        const putRequest = store.put({ ...existing, ...updates, id: existing.id });
        putRequest.onerror = () => abort(putRequest.error || new Error(`Failed to update article: ${articleId}`));
      };
      request.onerror = () => abort(request.error || new Error(`Failed to read article: ${articleId}`));
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      // onabort is the authoritative rejection path for aborted transactions.
    };
    tx.onabort = () => reject(failure || tx.error || new Error("Failed to update articles"));
  });
}

/** Delete all articles belonging to a specific feedId */
export async function deleteArticlesByFeedIdFromDB(feedId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readwrite");
      const store = tx.objectStore(STORE_ARTICLES);
      const index = store.index("feedId");
      const request = index.openCursor(IDBKeyRange.only(feedId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
}

/** Smooth one-time migration: Import data from legacy LocalStorage into IndexedDB */
export async function migrateFromLocalStorageIfNeeded(): Promise<Article[]> {
  const legacyKey = "inoreader_articles_v2";
  const raw = localStorage.getItem(legacyKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`Migrating ${parsed.length} legacy articles from LocalStorage to IndexedDB...`);
        const articles = parsed as Article[];
        await saveArticlesToDB(articles);
        const stored = await getAllArticlesFromDB();
        if (stored.length < articles.length || !articles.every((article) => stored.some((item) => item.id === article.id))) {
          throw new Error("IndexedDB migration verification failed");
        }
        localStorage.setItem("inoreader_articles_v2_migrated", "1");
        localStorage.removeItem(legacyKey);
        return articles;
      }
    }
  return [];
}
