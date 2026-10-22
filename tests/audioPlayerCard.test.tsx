import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AudioPlayerCard, resolveDurationLabel } from "../src/components/AudioPlayerCard";
import type { Article } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const article: Article = {
  id: "episode-1",
  feedId: "feed-1",
  feedTitle: "Example",
  title: "Episode",
  link: "https://example.com/episode",
  content: "",
  snippet: "",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
  audioUrl: "https://example.com/episode.mp3",
};

const model = (isInPlaylist: boolean) => ({
  article,
  audioRef: React.createRef<HTMLAudioElement>(),
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  audioPlayError: null,
  isInPlaylist,
  onTogglePlaylist: vi.fn(),
  togglePlay: vi.fn(),
  onSeek: vi.fn(),
  onRateChange: vi.fn(),
  onRewind: vi.fn(),
  onForward: vi.fn(),
  onTimeUpdate: vi.fn(),
  onLoadedMetadata: vi.fn(),
  onEnded: vi.fn(),
  onError: vi.fn(),
});

describe("AudioPlayerCard playlist control", () => {
  it("renders the episode cover and title, with a fallback when no cover exists", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<AudioPlayerCard model={{ ...model(false), article: {
      ...article, thumbnail: "https://example.com/cover.jpg",
    } }} />);
    expect(decodeURIComponent(container.querySelector(".wreader-audio-cover img")!.getAttribute("src")!))
      .toContain("https://example.com/cover.jpg");
    expect(container.querySelector(".wreader-audio-body strong")?.textContent).toBe(article.title);
    expect(container.textContent).not.toContain("播放进度 ·");
    container.innerHTML = renderToStaticMarkup(<AudioPlayerCard model={model(false)} />);
    expect(container.querySelector(".wreader-audio-cover .lucide-headphones")).not.toBeNull();
  });

  it("keeps playback, seeking, speed and queue controls interactive", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const controls = { ...model(false), currentTime: 20, duration: 100 };
    try {
      await act(async () => root.render(<AudioPlayerCard model={controls} />));
      for (const [label, callback] of [
        ["播放", controls.togglePlay], ["后退 15 秒", controls.onRewind],
        ["快进 30 秒", controls.onForward], ["调整播放速度", controls.onRateChange],
      ] as const) {
        await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
        expect(callback).toHaveBeenCalledTimes(1);
      }
      const slider = container.querySelector<HTMLInputElement>('input[aria-label="播放进度"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "45");
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(controls.onSeek).toHaveBeenCalledWith(45);
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="加入待播"]')!.click());
      expect(controls.onTogglePlaylist).toHaveBeenCalledWith(article.id);
      await act(async () => root.render(<AudioPlayerCard model={{ ...controls, isPlaying: true, isInPlaylist: true }} />));
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="暂停"]')!.click());
      expect(controls.togglePlay).toHaveBeenCalledTimes(2);
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="从待播移除"]')!.click());
      expect(controls.onTogglePlaylist).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("prefers the exact media duration and normalizes numeric feed durations", () => {
    expect(resolveDurationLabel(2536, "42 分钟")).toBe("42:16");
    expect(resolveDurationLabel(0, "2536")).toBe("42:16");
    expect(resolveDurationLabel(0, "42:16")).toBe("42:16");
  });

  it("preserves queue state while rendering the confirmed player controls", () => {
    const inactive = renderToStaticMarkup(<AudioPlayerCard model={model(false)} />);
    expect(inactive).toContain("M16 5H3M11 12H3M16 19H3M18 9v6M21 12h-6");
    expect(inactive).toContain('title="加入待播"');
    expect(inactive).toContain('aria-label="加入待播"');

    const active = renderToStaticMarkup(<AudioPlayerCard model={model(true)} />);
    expect(active).toContain("lucide-list-check");
    expect(active).toContain('title="从待播移除"');
    expect(active).toContain('aria-label="从待播移除"');
    expect(active).toContain("wreader-audio-card");
    expect(active).toContain("player-track");
    expect(active).toContain("player-toggle");
    expect(active).toContain('aria-label="后退 15 秒"');
    const rewindStart = active.indexOf('title="后退 15 秒"');
    const rewindEnd = active.indexOf("</button>", rewindStart);
    const rewindHtml = active.slice(rewindStart, rewindEnd);
    expect(rewindHtml).toContain('d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1-6.74 2.74L3 8M3 3v5h5"');
    expect(rewindHtml).toContain('d="M9 12h6"');
    expect(rewindHtml).not.toContain("<text");
    expect(rewindHtml).not.toContain("M12 8v8M9 12h6");
  });
});
