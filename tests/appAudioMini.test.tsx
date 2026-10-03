import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, Feed } from "../src/types";
import type { SharedAudioPlayer } from "../src/hooks/useAudioPlayer";
import { closeDB, getAudioProgressMapFromDB, replaceFeedsInDB, saveAppStateToDB, saveArticlesToDB } from "../src/services/dbService";
import { AudioPlayerMini } from "../src/components/AudioPlayerMini";
import { buildArticleLookup } from "../src/services/articleIndex";
import { usePlaylistAudioController } from "../src/hooks/usePlaylistAudioController";

vi.mock("../src/components/ArticleDetailModal", () => ({
  // Exercise App's real navigation/audio lifetime without unrelated transcription services.
  ArticleDetailModal: ({ article, audioPlayer, onClose, initialDetailTab }: {
    article: Article; audioPlayer: SharedAudioPlayer; onClose: () => void; initialDetailTab?: string;
  }) => <div data-testid="detail" data-id={article.id} data-tab={initialDetailTab}>
    <button aria-label="开始伴听" onClick={() => audioPlayer.toggleArticle(article.id, article.audioUrl!)}>play</button>
    <button aria-label="返回列表" onClick={onClose}>back</button>
  </div>,
}));
vi.mock("../src/services/rssService", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/rssService")>(),
  fetchRssFeed: vi.fn(() => new Promise(() => {})),
}));
vi.mock("../src/components/VirtualWindow", () => ({
  // jsdom has no viewport measurements; keep real rows for the audio/navigation checks.
  VirtualWindow: ({ count, renderItem }: { count: number; renderItem: (index: number) => React.ReactNode }) => <>{Array.from({ length: count }, (_, index) => <React.Fragment key={index}>{renderItem(index)}</React.Fragment>)}</>,
}));
import App from "../src/App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const article = (id: string, audio = true): Article => ({
  id, feedId: "feed", feedTitle: "Podcast", title: id, link: `https://example.com/${id}`,
  pubDate: new Date().toISOString(), content: "Body", snippet: "Body", read: false, starred: true,
  audioUrl: audio ? `https://example.com/${id}.mp3` : undefined,
  transcription: audio ? { provider: "aliyun", sourceAudioUrl: `https://example.com/${id}.mp3`, updatedAt: new Date().toISOString(), status: "completed", segments: [{ startMs: 0, endMs: 5000, text: "Transcript" }] } : undefined,
});
const episodes = [article("episode-a"), article("episode-b"), article("news", false)];
const feed: Feed = { id: "feed", title: "Podcast", feedUrl: "https://example.com/feed", siteUrl: "https://example.com", category: "Podcast", unreadCount: 2 };
let root: Root;
let container: HTMLDivElement;
const originalWidth = window.innerWidth;

beforeEach(async () => {
  await closeDB();
  for (const { name } of await indexedDB.databases()) {
    if (name) await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  }
  localStorage.clear();
  window.history.replaceState({}, "", "/today");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  await closeDB();
});

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error(`State did not arrive: ${container.textContent}`);
}
async function click(selector: string) {
  const el = container.querySelector<HTMLElement>(selector);
  expect(el, selector).not.toBeNull();
  await act(async () => el!.click());
}
async function renderApp() {
  await replaceFeedsInDB([feed]);
  await saveArticlesToDB(episodes);
  await saveAppStateToDB({ onboardingCompleted: true, playlistIds: ["episode-a", "episode-b"] });
  await act(async () => root.render(<App />));
  await waitFor(() => Boolean(container.querySelector('[data-article-id="episode-a"]')));
}
function mini() { return container.querySelector<HTMLElement>('[aria-label="伴听播放器"]'); }

describe("global mini player", () => {
  it("keeps one media element/source while navigating, controls pause/seek, and reopens the transcript", async () => {
    await renderApp();
    await click('[data-article-id="episode-a"]');
    await click('[aria-label="开始伴听"]');
    const audio = container.querySelector("audio")!;
    const load = vi.mocked(HTMLMediaElement.prototype.load);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    Object.defineProperty(audio, "duration", { configurable: true, value: 2700 });
    await act(async () => {
      audio.currentTime = 750;
      audio.dispatchEvent(new Event("loadedmetadata"));
      audio.dispatchEvent(new Event("timeupdate"));
    });
    expect(mini()).toBeNull();
    await click('[aria-label="返回列表"]');
    expect(mini()?.textContent).toContain("12:30 / 45:00");
    expect(container.querySelector(".wreader-app")?.getAttribute("data-mobile-tabs-visible")).toBe("true");
    const source = audio.src;
    const loads = load.mock.calls.length;
    const pauses = pause.mock.calls.length;
    for (const index of [1, 2, 0]) {
      await click(`.wreader-mobile-tabs button:nth-child(${index + 1})`);
      expect(container.querySelector("audio")).toBe(audio);
      expect(audio.src).toBe(source);
      expect(mini()).not.toBeNull();
    }
    expect(load).toHaveBeenCalledTimes(loads);
    expect(pause).toHaveBeenCalledTimes(pauses);
    await click('.wreader-mini-player [aria-label="后退 15 秒"]');
    expect(audio.currentTime).toBe(735);
    await click('.wreader-mini-player [aria-label="暂停"]');
    expect(mini()?.getAttribute("data-playing")).toBe("false");
    await click('.wreader-mini-player [aria-label="播放"]');
    expect(mini()?.getAttribute("data-playing")).toBe("true");
    await click('.wreader-mini-player [aria-label="返回播客：episode-a"]');
    expect(container.querySelector('[data-testid="detail"]')?.getAttribute("data-tab")).toBe("transcript");
    expect(window.location.search).toContain("tab=transcript");
    expect(mini()).toBeNull();
    expect(audio.currentTime).toBe(735);
    expect(load).toHaveBeenCalledTimes(loads);
    await click('[aria-label="返回列表"]');
    await click('[data-article-id="news"]');
    expect(mini()).not.toBeNull();
    expect(container.querySelector(".wreader-app")?.getAttribute("data-mobile-tabs-visible")).toBe("false");
    await click('.wreader-mini-player [aria-label="停止并关闭播放器"]');
    expect(mini()).toBeNull();
    expect(audio.getAttribute("src")).toBeNull();
    expect((await getAudioProgressMapFromDB())["episode-a"].currentTime).toBe(735);
  });

  it("continues the queue while keeping the current news detail and shows ended state at the end", async () => {
    await renderApp();
    await click('[data-article-id="episode-a"]');
    await click('[aria-label="开始伴听"]');
    await click('[aria-label="返回列表"]');
    await click('[data-article-id="news"]');
    const audio = container.querySelector("audio")!;
    const url = window.location.href;
    await act(async () => { audio.dispatchEvent(new Event("ended")); });
    expect(audio.src).toContain("episode-b.mp3");
    expect(mini()?.textContent).toContain("episode-b");
    expect(container.querySelector('[data-testid="detail"]')?.getAttribute("data-id")).toBe("news");
    expect(window.location.href).toBe(url);
    Object.defineProperty(audio, "duration", { configurable: true, value: 60 });
    await act(async () => {
      audio.currentTime = 60;
      audio.dispatchEvent(new Event("timeupdate"));
      audio.dispatchEvent(new Event("ended"));
    });
    expect(mini()?.textContent).toContain("已播放完毕");
    expect(mini()?.querySelector('[aria-label="重新播放"]')).not.toBeNull();
  });

  it("keeps failure and cover fallback visible when paused and uses safe controls", async () => {
    const seekTo = vi.fn(), toggleArticle = vi.fn(), stop = vi.fn(), open = vi.fn();
    const player = { currentTime: 8, duration: 0, isPlaying: false, audioPlayError: "Unavailable", seekTo, toggleArticle, stop } as unknown as SharedAudioPlayer;
    await act(async () => root.render(<AudioPlayerMini article={episodes[0]} player={player} onOpen={open} />));
    expect(mini()?.textContent).toContain("音频载入失败");
    expect(mini()?.querySelector(".wreader-mini-cover svg")).not.toBeNull();
    await click('.wreader-mini-player [aria-label="返回播客：episode-a"]');
    expect(open).toHaveBeenCalledOnce();
    expect(toggleArticle).not.toHaveBeenCalled();
    await click('.wreader-mini-player [aria-label="后退 15 秒"]');
    expect(seekTo).toHaveBeenCalledWith(-7);
  });

  it("does not navigate away from news when the playing episode is removed", async () => {
    let controller!: ReturnType<typeof usePlaylistAudioController>;
    const selected = vi.fn();
    const lookup = buildArticleLookup(episodes);
    function Harness() {
      controller = usePlaylistAudioController({ articleLookup: lookup, selectedArticleId: "news", setSelectedArticleId: selected, showToast: vi.fn(), showToastWithAction: vi.fn() });
      return <audio ref={controller.audioPlayer.audioRef} />;
    }
    localStorage.setItem("wreader_playlist", JSON.stringify(["episode-a", "episode-b"]));
    await act(async () => root.render(<Harness />));
    await act(async () => controller.audioPlayer.playArticle("episode-a", episodes[0].audioUrl!));
    await act(async () => controller.removeFromPlaylist("episode-a"));
    expect(selected).not.toHaveBeenCalled();
    expect(controller.audioPlayer.articleId).toBe("episode-b");
    expect(controller.audioPlayer.isPlaying).toBe(false);
  });
});
