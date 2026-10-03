import { useEffect, useRef } from "react";
import { animateSwipe, shouldIgnoreSwipe } from "./swipeGesture";
import { useLatestRef } from "./useLatestRef";

interface SwipeableRowOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  threshold?: number;
  enabled?: boolean;
  resetKey?: string;
}

export function useSwipeableRow<T extends HTMLElement = HTMLElement>({
  onSwipeRight, onSwipeLeft, threshold = 64, enabled = true, resetKey,
}: SwipeableRowOptions) {
  const rowRef = useRef<T | null>(null);
  const rightRef = useLatestRef(onSwipeRight);
  const leftRef = useLatestRef(onSwipeLeft);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || !enabled) return;
    const container = el.parentElement;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let horizontal = false;
    let vibrated = false;
    let suppressClickUntil = 0;
    let cancelAnimation: (() => void) | undefined;

    const release = () => {
      const id = pointerId;
      pointerId = null;
      if (id !== null && el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
      document.removeEventListener("pointerdown", anotherPointer, true);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", cancel);
    };
    const reset = () => {
      release();
      cancelAnimation?.();
      cancelAnimation = undefined;
      horizontal = false;
      el.style.transform = "";
      el.style.transition = "";
      el.style.willChange = "";
      container?.removeAttribute("data-swipe-direction");
      container?.removeAttribute("data-swipe-active");
    };
    const paint = () => {
      const distance = Math.abs(dx);
      const visualDx = Math.sign(dx) * (distance <= threshold ? distance : threshold + (distance - threshold) * 0.45);
      el.style.transform = `translateX(${visualDx}px)`;
      container?.setAttribute("data-swipe-direction", dx >= 0 ? "right" : "left");
      container?.setAttribute("data-swipe-active", String(distance >= threshold));
      if (distance >= threshold && !vibrated) {
        vibrated = true;
        try { navigator.vibrate?.(10); } catch { /* Optional device feedback. */ }
      }
    };
    const settle = (commit: boolean) => {
      const wasHorizontal = horizontal;
      const action = commit && Math.abs(dx) >= threshold ? (dx > 0 ? rightRef.current : leftRef.current) : undefined;
      release();
      if (!wasHorizontal) return;
      horizontal = false;
      suppressClickUntil = Date.now() + 400;
      cancelAnimation = animateSwipe(el, 0, reset);
      action?.();
    };
    function anotherPointer(event: PointerEvent) {
      if (event.pointerType === "touch" && event.pointerId !== pointerId) settle(false);
    }
    const start = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary || window.innerWidth > 760) return;
      if (shouldIgnoreSwipe(event.target, el)) return;
      reset();
      suppressClickUntil = 0;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
      vibrated = false;
      el.setPointerCapture?.(event.pointerId);
      document.addEventListener("pointerdown", anotherPointer, { capture: true, passive: true });
      document.addEventListener("pointerup", end, { passive: true });
      document.addEventListener("pointercancel", cancel, { passive: true });
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const nextDx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!horizontal) {
        if (Math.hypot(nextDx, dy) < 10) return;
        if (Math.abs(nextDx) <= Math.abs(dy) * 1.2) { reset(); return; }
        horizontal = true;
        el.style.transition = "none";
        el.style.willChange = "transform";
      }
      dx = nextDx;
      paint();
    };
    function end(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      dx = event.clientX - startX;
      settle(true);
    }
    function cancel(event: PointerEvent) {
      if (event.pointerId === pointerId) settle(false);
    }
    const selectionChanged = () => { if (!window.getSelection()?.isCollapsed) settle(false); };
    const captureClick = (event: MouseEvent) => {
      if (event.detail > 0 && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    el.addEventListener("pointerdown", start, { passive: true });
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("lostpointercapture", cancel);
    el.addEventListener("click", captureClick, true);
    document.addEventListener("selectionchange", selectionChanged);
    window.addEventListener("resize", reset);
    window.addEventListener("pagehide", reset);
    window.addEventListener("blur", reset);
    return () => {
      reset();
      el.removeEventListener("pointerdown", start);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("lostpointercapture", cancel);
      el.removeEventListener("click", captureClick, true);
      document.removeEventListener("selectionchange", selectionChanged);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pagehide", reset);
      window.removeEventListener("blur", reset);
    };
  }, [enabled, leftRef, resetKey, rightRef, threshold]);
  return rowRef;
}
