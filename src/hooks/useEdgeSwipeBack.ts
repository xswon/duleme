import { useEffect, useRef } from "react";
import { animateSwipe, shouldIgnoreSwipe } from "./swipeGesture";
import { useLatestRef } from "./useLatestRef";

interface EdgeSwipeBackOptions {
  onClose: () => void;
  enabled?: boolean;
  edgeWidth?: number;
  resetKey?: string;
}

export function useEdgeSwipeBack<T extends HTMLElement = HTMLElement>({
  onClose, enabled = true, edgeWidth = 25, resetKey,
}: EdgeSwipeBackOptions) {
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useLatestRef(onClose);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    const workspace = el.closest<HTMLElement>(".wreader-workspace-grid");
    let touchId: number | null = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let horizontal = false;
    let settling = false;
    let frame = 0;
    let cancelAnimation: (() => void) | undefined;
    let samples: Array<{ x: number; time: number }> = [];
    let suppressClickUntil = 0;

    const paint = () => {
      frame = 0;
      el.style.transform = `translateX(${dx}px)`;
      workspace?.style.setProperty("--edge-swipe-progress", String(Math.min(1, dx / window.innerWidth)));
    };
    const reset = () => {
      cancelAnimation?.();
      cancelAnimation = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      touchId = null;
      horizontal = false;
      settling = false;
      dx = 0;
      el.style.transform = "";
      el.style.transition = "";
      el.style.willChange = "";
      workspace?.style.removeProperty("--edge-swipe-progress");
      workspace?.removeAttribute("data-edge-swiping");
      el.removeEventListener("touchmove", move);
    };
    const settle = (dismiss: boolean) => {
      touchId = null;
      el.removeEventListener("touchmove", move);
      if (!horizontal || settling) return;
      settling = true;
      suppressClickUntil = Date.now() + 400;
      cancelAnimationFrame(frame);
      paint();
      workspace?.setAttribute("data-edge-swiping", "settling");
      cancelAnimation = animateSwipe(el, dismiss ? window.innerWidth : 0, () => {
        if (dismiss) onCloseRef.current();
        else reset();
      });
      workspace?.style.setProperty("--edge-swipe-progress", dismiss ? "1" : "0");
    };
    const record = (x: number) => {
      const time = performance.now();
      samples = samples.filter((sample) => time - sample.time <= 100);
      samples.push({ x, time });
    };
    const move = (event: TouchEvent) => {
      if (touchId === null) return;
      const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
      if (event.touches.length !== 1 || !touch || !window.getSelection()?.isCollapsed) {
        settle(false);
        return;
      }
      const nextDx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!horizontal) {
        if (Math.hypot(nextDx, dy) < 10) return;
        if (nextDx <= 0 || nextDx <= Math.abs(dy) * 1.2 || !event.cancelable) {
          reset();
          return;
        }
        horizontal = true;
        el.style.transition = "none";
        el.style.willChange = "transform";
        workspace?.setAttribute("data-edge-swiping", "true");
      }
      if (!event.cancelable) { settle(false); return; }
      event.preventDefault();
      dx = Math.max(0, Math.min(window.innerWidth, nextDx));
      record(touch.clientX);
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { settle(false); return; }
      if (settling || window.innerWidth > 760) return;
      const touch = event.touches[0];
      if (touch.clientX > edgeWidth || shouldIgnoreSwipe(event.target, el)) return;
      reset();
      touchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      samples = [];
      record(startX);
      // Only edge candidates install a scroll-blocking listener.
      el.addEventListener("touchmove", move, { passive: false });
    };
    const end = (event: TouchEvent) => {
      if (touchId === null) return;
      const touch = Array.from(event.changedTouches).find((item) => item.identifier === touchId);
      if (!touch) return;
      dx = Math.max(0, Math.min(window.innerWidth, touch.clientX - startX));
      record(touch.clientX);
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocity = (last.x - first.x) / Math.max(1, last.time - first.time);
      settle(event.touches.length === 0 && (dx >= window.innerWidth * 0.3 || (dx >= 40 && velocity > 0.5)));
    };
    const cancel = () => { if (touchId !== null) settle(false); };
    const selectionChanged = () => { if (!window.getSelection()?.isCollapsed) cancel(); };
    const captureClick = (event: MouseEvent) => {
      if (event.detail > 0 && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
    el.addEventListener("click", captureClick, true);
    document.addEventListener("selectionchange", selectionChanged);
    window.addEventListener("resize", reset);
    window.addEventListener("pagehide", reset);
    window.addEventListener("blur", reset);
    return () => {
      reset();
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
      el.removeEventListener("click", captureClick, true);
      document.removeEventListener("selectionchange", selectionChanged);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pagehide", reset);
      window.removeEventListener("blur", reset);
    };
  }, [edgeWidth, enabled, onCloseRef, resetKey]);
  return containerRef;
}
