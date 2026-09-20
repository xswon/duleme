import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, ArticleNote } from "../src/types";
import {
  closeDB,
  createDataBackup,
  deleteArticleNoteFromDB,
  deleteArticleNotesFromDB,
  deleteArticlesByFeedIdFromDB,
  getAllArticlesFromDB,
  getFeedsFromDB,
  getAllArticleNotesFromDB,
  getArticleNotesFromDB,
  getSecretFromDB,
  migrateArticleNoteIdsInDB,
  migrateFromLocalStorageIfNeeded,
  replaceArticlesForFeedsInDB,
  replaceFeedsInDB,
  restoreDataBackup,
  saveAppStateToDB,
  saveArticlesToDB,
  saveSecretToDB,
  saveArticleNoteToDB,
  updateArticleInDB,
  updateArticlesInDB,
} from "../src/services/dbService";
import {
  mergeFetchedFeedArticles,
  migrateAudioProgressMap,
  normalizeStoredArticle,
} from "../src/services/rssService";

const article = (id: string, feedId = "feed-1"): Article => ({
  id,
  feedId,
  feedTitle: "Feed",
  title: id,
  link: `https://example.com/${id}`,
  pubDate: new Date().toISOString(),
  snippet: "snippet",
  content: "content",
  read: false,
  starred: false,
});

beforeEach(async () => {
  await closeDB();
  const databases = await indexedDB.databases();
  await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }) : Promise.resolve()));
  localStorage.clear();
});

describe("article IndexedDB persistence", () => {
  it("normalizes legacy BidClub fields into the canonical enrichment reference", () => {
    const legacy = {
      ...article("legacy-bidclub"),
      bidclubUrl: "https://bidclub.ai/e/episode-42",
      bidclubSlug: "episode-42",
    } as Article;

    const normalized = normalizeStoredArticle(legacy);

    expect(normalized.enrichment).toEqual({
      provider: "bidclub",
      episodeId: "episode-42",
      episodeUrl: "https://bidclub.ai/e/episode-42",
      status: "candidate",
      matchedBy: "legacy",
    });
    expect(normalized).not.toHaveProperty("bidclubUrl");
    expect(normalized).not.toHaveProperty("bidclubSlug");
  });

  it("downgrades pre-API available references but preserves API-verified ones", () => {
    const legacyAvailable = normalizeStoredArticle({
      ...article("legacy-available"),
      enrichment: {
        provider: "bidclub",
        episodeId: "episode-42",
        status: "available",
        matchedBy: "source-url",
      },
    });
    const apiAvailable = normalizeStoredArticle({
      ...article("api-available"),
      enrichment: {
        provider: "bidclub",
        episodeId: "episode-43",
        status: "available",
        matchedBy: "api",
      },
    });

    expect(legacyAvailable.enrichment).toMatchObject({ status: "candidate", matchedBy: "source-url" });
    expect(apiAvailable.enrichment).toMatchObject({ status: "available", matchedBy: "api" });
  });

  it("keeps read, starred and AI summary state when an RSS id changes", () => {
    const old = { ...article("old"), read: true, starred: true, aiSummary: "keep" };
    const fresh = { ...article("new"), title: old.title, pubDate: old.pubDate };
    const result = mergeFetchedFeedArticles([old], [fresh], new Set(["feed-1"]));
    expect(result.articles[0]).toMatchObject({ id: "new", read: true, starred: true, aiSummary: "keep" });
  });

  it("collapses duplicate legacy and canonical copies during refresh", () => {
    const canonical = { ...article("canonical"), title: "Same episode", starred: true };
    const legacy = { ...article("legacy"), title: "Same episode", starred: true };
    const fresh = { ...article("canonical"), title: "Same episode" };

    const result = mergeFetchedFeedArticles(
      [canonical, legacy],
      [fresh],
      new Set(["feed-1"])
    );

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({ id: "canonical", starred: true });
    expect(result.articleIdMap.get("legacy")).toBe("canonical");
  });

  it("does not migrate state or enrichment between different same-day episodes", () => {
    const pubDate = "2026-08-18T08:00:00.000Z";
    const old = {
      ...article("old"),
      title: "Episode Alpha",
      pubDate,
      read: true,
      enrichment: {
        provider: "bidclub" as const,
        episodeId: "alpha",
        status: "available" as const,
        matchedBy: "source-url" as const,
      },
    };
    const fresh = { ...article("new"), title: "Episode Beta", pubDate };

    const result = mergeFetchedFeedArticles([old], [fresh], new Set(["feed-1"]));

    expect(result.articles[0]).toMatchObject({ id: "new", read: false });
    expect(result.articles[0]).not.toHaveProperty("enrichment");
  });

  it("moves saved audio progress when a refreshed episode id changes", () => {
    const progress = { currentTime: 125, duration: 3600, updatedAt: 12345 };
    const result = migrateAudioProgressMap(
      { old: progress },
      new Map([["old", "new"]])
    );

    expect(result).toEqual({ new: progress });
  });

  it("preserves article state patches", async () => {
    await saveArticlesToDB([article("a")]);
    await updateArticleInDB("a", { read: true, starred: true, aiSummary: "summary" });
    await expect(getAllArticlesFromDB()).resolves.toMatchObject([
      { id: "a", read: true, starred: true, aiSummary: "summary" },
    ]);
  });

  it("updates a batch of article states in one transaction", async () => {
    await saveArticlesToDB([article("a"), article("b"), article("untouched")]);

    await updateArticlesInDB(["a", "b", "a"], { read: true });

    await expect(getAllArticlesFromDB()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "a", read: true }),
      expect.objectContaining({ id: "b", read: true }),
      expect.objectContaining({ id: "untouched", read: false }),
    ]));
  });

  it("rolls back every article when an atomic batch contains an invalid id", async () => {
    await saveArticlesToDB([article("a"), article("b")]);

    await expect(updateArticlesInDB(["a", "missing", "b"], { read: true }))
      .rejects.toThrow("Article not found: missing");

    await expect(getAllArticlesFromDB()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "a", read: false }),
      expect.objectContaining({ id: "b", read: false }),
    ]));
  });

  it("persists, updates and deletes article notes independently", async () => {
    const note: ArticleNote = {
      id: "note-1",
      articleId: "a",
      source: "transcript",
      quote: "A useful excerpt",
      transcriptStartMs: 125000,
      createdAt: 1,
      updatedAt: 1,
    };
    await saveArticleNoteToDB(note);
    await saveArticleNoteToDB({ ...note, note: "Remember this", updatedAt: 2 });

    await expect(getArticleNotesFromDB("a")).resolves.toEqual([
      { ...note, note: "Remember this", updatedAt: 2 },
    ]);
    await expect(getArticleNotesFromDB("other")).resolves.toEqual([]);

    await deleteArticleNoteFromDB(note.id);
    await expect(getArticleNotesFromDB("a")).resolves.toEqual([]);
  });

  it("deletes multiple article notes in one transaction", async () => {
    const base: ArticleNote = { id: "bulk-a", articleId: "a", source: "body", quote: "A", createdAt: 1, updatedAt: 1 };
    await saveArticleNoteToDB(base);
    await saveArticleNoteToDB({ ...base, id: "bulk-b", quote: "B" });
    await deleteArticleNotesFromDB(["bulk-a", "bulk-b"]);
    await expect(getAllArticleNotesFromDB()).resolves.toEqual([]);
  });

  it("repoints notes without changing their IDs when an article ID migrates", async () => {
    const oldNote: ArticleNote = {
      id: "stable-note-id",
      articleId: "legacy-article",
      source: "body",
      quote: "Keep this excerpt",
      createdAt: 1,
      updatedAt: 1,
    };
    const untouchedNote: ArticleNote = {
      ...oldNote,
      id: "other-note",
      articleId: "other-article",
    };
    await saveArticleNoteToDB(oldNote);
    await saveArticleNoteToDB(untouchedNote);

    await migrateArticleNoteIdsInDB(new Map([["legacy-article", "canonical-article"]]));

    await expect(getArticleNotesFromDB("legacy-article")).resolves.toEqual([]);
    await expect(getArticleNotesFromDB("canonical-article")).resolves.toMatchObject([
      { id: "stable-note-id", articleId: "canonical-article", quote: "Keep this excerpt" },
    ]);
    await expect(getArticleNotesFromDB("other-article")).resolves.toMatchObject([
      { id: "other-note", articleId: "other-article" },
    ]);
  });

  it("returns all notes by most recently updated first", async () => {
    const base: ArticleNote = { id: "older", articleId: "a", source: "body", quote: "Older", createdAt: 1, updatedAt: 2 };
    await saveArticleNoteToDB(base);
    await saveArticleNoteToDB({ ...base, id: "newer", quote: "Newer", updatedAt: 5 });

    await expect(getAllArticleNotesFromDB()).resolves.toMatchObject([
      { id: "newer" },
      { id: "older" },
    ]);
  });

  it("deletes a feed without allowing deleted articles to reappear", async () => {
    await saveArticlesToDB([article("a"), article("b", "feed-2")]);
    await deleteArticlesByFeedIdFromDB("feed-1");
    await expect(getAllArticlesFromDB()).resolves.toMatchObject([{ id: "b", feedId: "feed-2" }]);
  });

  it("atomically replaces refreshed feed records so migrated ids cannot reappear", async () => {
    await saveArticlesToDB([
      { ...article("legacy"), starred: true },
      article("unchanged", "feed-2"),
    ]);

    await replaceArticlesForFeedsInDB(
      ["feed-1"],
      [{ ...article("canonical"), starred: true }]
    );

    const stored = await getAllArticlesFromDB();
    expect(stored.map((item) => item.id).sort()).toEqual(["canonical", "unchanged"]);
    expect(stored.find((item) => item.id === "canonical")).toMatchObject({ starred: true });
  });

  it("keeps legacy data when the IndexedDB migration write fails", async () => {
    const legacy = JSON.stringify([article("legacy")]);
    localStorage.setItem("inoreader_articles_v2", legacy);
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new Error("simulated write failure");
    });

    await expect(migrateFromLocalStorageIfNeeded()).rejects.toThrow("simulated write failure");
    expect(localStorage.getItem("inoreader_articles_v2")).toBe(legacy);
    expect(localStorage.getItem("inoreader_articles_v2_migrated")).toBeNull();

    put.mockRestore();
  });

  it("excludes AI secrets from backups and preserves them across restore", async () => {
    await saveAppStateToDB({
      aiConfig: {
        enabled: true,
        providerPreset: "custom",
        baseURL: "https://api.example.com/v1",
        model: "model-1",
      },
    });
    await saveSecretToDB("ai", { apiKey: "super-secret-key" });

    const backup = await createDataBackup();
    expect(JSON.stringify(backup)).toContain("https://api.example.com/v1");
    expect(JSON.stringify(backup)).not.toContain("super-secret-key");

    await restoreDataBackup(JSON.stringify(backup));
    await expect(getSecretFromDB<{ apiKey: string }>("ai")).resolves.toEqual({
      apiKey: "super-secret-key",
    });
  });

  it("clears a saved API key when a backup switches to a different AI endpoint", async () => {
    await saveAppStateToDB({
      aiConfig: {
        enabled: true,
        providerPreset: "custom",
        baseURL: "https://old.example.com/v1",
        model: "old-model",
      },
    });
    await saveSecretToDB("ai", { apiKey: "old-secret" });

    const cleanBackup = await createDataBackup();
    const changed = {
      ...cleanBackup,
      data: {
        ...cleanBackup.data,
        appState: {
          ...(cleanBackup.data.appState || {}),
          aiConfig: {
            enabled: true,
            providerPreset: "custom",
            baseURL: "https://new.example.com/v1",
            model: "new-model",
          },
        },
      },
    };
    const payload = JSON.stringify(changed.data);
    let hash = 2166136261;
    for (let index = 0; index < payload.length; index += 1) {
      hash ^= payload.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    changed.checksum = (hash >>> 0).toString(16).padStart(8, "0");

    await restoreDataBackup(JSON.stringify(changed));
    await expect(getSecretFromDB("ai")).resolves.toBeNull();
  });

  it("exports and restores a checksummed business-data backup", async () => {
    await replaceFeedsInDB([{
      id: "feed-1", title: "Feed", feedUrl: "https://example.com/feed.xml", siteUrl: "https://example.com",
      category: "未分类", unreadCount: 1,
    }]);
    await saveArticlesToDB([article("backup-article")]);
    await saveAppStateToDB({ playlistIds: ["backup-article"], categories: ["未分类"] });
    const backup = await createDataBackup();
    expect(backup.version).toBe(1);
    expect(backup.checksum).toMatch(/^[0-9a-f]{8}$/);

    await replaceFeedsInDB([]);
    await restoreDataBackup(JSON.stringify(backup));
    await expect(getAllArticlesFromDB()).resolves.toMatchObject([{ id: "backup-article" }]);
    await expect(getFeedsFromDB()).resolves.toMatchObject([{ id: "feed-1" }]);
    await expect(restoreDataBackup(JSON.stringify({ ...backup, checksum: "bad" }))).rejects.toThrow("校验");
  });
});
