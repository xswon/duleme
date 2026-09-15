import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAudioTime, resolveAudioUrl } from "../src/hooks/useAudioPlayer";
import { useSharedAudioPlayer, type SharedAudioPlayer } from "../src/hooks/useAudioPlayer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("audio player helpers", () => {
  it("formats playback time consistently", () => {
    expect(formatAudioTime(0)).toBe("0:00");
    expect(formatAudioTime(65.9)).toBe("1:05");
  });
  it("uses the proxy for supported remote audio hosts", () => {
    expect(resolveAudioUrl("http://example.com/a.mp3")).toBe("/api/proxy-audio?url=http%3A%2F%2Fexample.com%2Fa.mp3");
    expect(resolveAudioUrl("/api/proxy-audio?url=x")).toBe("/api/proxy-audio?url=x");
  });

  it("keeps one media element while switching episodes and persists its progress", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const onProgress = vi.fn();
    const onEnded = vi.fn();
    let player: SharedAudioPlayer | undefined;
    function Harness() {
      player = useSharedAudioPlayer(onProgress, onEnded);
      return React.createElement("audio", { ref: player.audioRef, onTimeUpdate: player.handleTimeUpdate, onEnded: player.handleEnded });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Harness)));

    await act(async () => player?.playArticle("one", "/one.mp3", { currentTime: 12, duration: 120 }));
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(player?.articleId).toBe("one");
    expect(play).toHaveBeenCalled();

    await act(async () => player?.playArticle("two", "/two.mp3"));
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(player?.articleId).toBe("two");
    expect(pause).toHaveBeenCalled();

    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { configurable: true, value: 180 });
    audio.currentTime = 31;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    expect(onProgress).toHaveBeenLastCalledWith("two", 31, 180);
    await act(async () => audio.dispatchEvent(new Event("ended", { bubbles: true })));
    expect(onEnded).toHaveBeenCalledWith("two");
    act(() => root.unmount());
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
