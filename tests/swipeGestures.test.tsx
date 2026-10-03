import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEdgeSwipeBack } from "../src/hooks/useEdgeSwipeBack";
import { useSwipeableRow } from "../src/hooks/useSwipeableRow";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let now = 0;
const originalWidth = window.innerWidth;

function touch(target: Element, type: string, x: number, y = 100, count = 1, cancelable = true) {
  const point = { identifier: 1, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable });
  Object.defineProperties(event, {
    touches: { value: type === "touchend" || type === "touchcancel" ? [] : Array.from({ length: count }, (_, index) => ({ ...point, identifier: index + 1 })) },
    changedTouches: { value: [point] },
  });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function pointer(target: Element, type: string, x: number, y = 100, id = 1, pointerType = "touch") {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: id }, pointerType: { value: pointerType }, isPrimary: { value: id === 1 },
    clientX: { value: x }, clientY: { value: y },
  });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function transition(target: Element, propertyName = "transform") {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  act(() => { target.dispatchEvent(event); });
}

function Edge({ onClose, id = "a", enabled = true }: { onClose: () => void; id?: string; enabled?: boolean }) {
  const ref = useEdgeSwipeBack<HTMLDivElement>({ onClose, resetKey: id, enabled });
  return <div className="wreader-workspace-grid"><div ref={ref} data-testid="edge"><p>Body</p><button>Control</button><div data-swipe-ignore>Table</div></div></div>;
}

function Row({ right, left, id = "a" }: { right: () => void; left: () => void; id?: string }) {
  const ref = useSwipeableRow<HTMLDivElement>({ onSwipeRight: right, onSwipeLeft: left, resetKey: id });
  return <div><div ref={ref} data-testid="row"><p>Story</p><button>Control</button></div></div>;
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
});

function edge() { return container.querySelector<HTMLElement>('[data-testid="edge"]')!; }
function row() { return container.querySelector<HTMLElement>('[data-testid="row"]')!; }
function slowEdgeDrag(x = 160) {
  touch(edge(), "touchstart", 20);
  now = 250;
  touch(edge(), "touchmove", x);
  now = 500;
  touch(edge(), "touchend", x);
}

describe("edge swipe back", () => {
  it("closes at 30% once, ignoring child/property transitions and clearing its fallback", () => {
    const close = vi.fn();
    act(() => root.render(<Edge onClose={close} />));
    slowEdgeDrag();
    expect(edge().style.transform).toBe("translateX(390px)");
    transition(edge().querySelector("p")!);
    transition(edge(), "opacity");
    expect(close).not.toHaveBeenCalled();
    transition(edge());
    act(() => { vi.advanceTimersByTime(500); });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps center/desktop, controls, selection and vertical drags native", () => {
    const close = vi.fn();
    act(() => root.render(<Edge onClose={close} />));
    for (const target of [edge().querySelector("button")!, edge().querySelector("[data-swipe-ignore]")!]) {
      touch(target, "touchstart", 20);
      expect(touch(target, "touchmove", 200).defaultPrevented).toBe(false);
      touch(target, "touchend", 200);
    }
    touch(edge(), "touchstart", 26);
    expect(touch(edge(), "touchmove", 200).defaultPrevented).toBe(false);
    touch(edge(), "touchend", 200);
    touch(edge(), "touchstart", 20);
    expect(touch(edge(), "touchmove", 25, 180).defaultPrevented).toBe(false);
    expect(touch(edge(), "touchmove", 220, 180).defaultPrevented).toBe(false);
    touch(edge(), "touchend", 220, 180);
    const range = document.createRange();
    range.selectNodeContents(edge().querySelector("p")!);
    window.getSelection()?.addRange(range);
    slowEdgeDrag();
    window.getSelection()?.removeAllRanges();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    slowEdgeDrag(350);
    act(() => { vi.advanceTimersByTime(500); });
    expect(close).not.toHaveBeenCalled();
    expect(edge().style.transform).toBe("");
  });

  it.each(["touchcancel", "multitouch", "uncancelable"])("cancels without closing on %s", (reason) => {
    const close = vi.fn();
    act(() => root.render(<Edge onClose={close} />));
    touch(edge(), "touchstart", 20);
    touch(edge(), "touchmove", 200);
    if (reason === "touchcancel") touch(edge(), "touchcancel", 200);
    if (reason === "multitouch") touch(edge(), "touchstart", 200, 100, 2);
    if (reason === "uncancelable") touch(edge(), "touchmove", 210, 100, 1, false);
    touch(edge(), "touchend", 200);
    act(() => { vi.advanceTimersByTime(500); });
    expect(close).not.toHaveBeenCalled();
    expect(edge().style.transform).toBe("");
  });

  it("uses release velocity, and cancels when returning to the origin or pausing", () => {
    const close = vi.fn();
    act(() => root.render(<Edge onClose={close} />));
    touch(edge(), "touchstart", 20);
    now = 30;
    touch(edge(), "touchmove", 100);
    now = 50;
    touch(edge(), "touchend", 100);
    transition(edge());
    expect(close).toHaveBeenCalledTimes(1);
    act(() => root.render(<Edge onClose={close} id="b" />));
    touch(edge(), "touchstart", 20);
    now = 70;
    touch(edge(), "touchmove", 200);
    now = 100;
    touch(edge(), "touchmove", 20);
    touch(edge(), "touchend", 20);
    transition(edge());
    touch(edge(), "touchstart", 20);
    now = 150;
    touch(edge(), "touchmove", 100);
    now = 500;
    touch(edge(), "touchend", 100);
    act(() => { vi.advanceTimersByTime(500); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(edge().style.transform).toBe("");
  });

  it("cancels a pending dismissal on article change, disable, resize or unmount", () => {
    const close = vi.fn();
    act(() => root.render(<Edge onClose={close} />));
    slowEdgeDrag();
    act(() => root.render(<Edge onClose={close} id="b" />));
    act(() => { vi.advanceTimersByTime(500); });
    expect(close).not.toHaveBeenCalled();
    slowEdgeDrag();
    act(() => { window.dispatchEvent(new Event("resize")); });
    act(() => { vi.advanceTimersByTime(500); });
    slowEdgeDrag();
    act(() => root.render(<Edge onClose={close} enabled={false} />));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => root.render(<Edge onClose={close} />));
    slowEdgeDrag();
    act(() => root.render(null));
    act(() => { vi.advanceTimersByTime(500); });
    expect(close).not.toHaveBeenCalled();
  });

  it("settles immediately with reduced motion, including the fallback", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const close = vi.fn();
    act(() => root.render(<Edge onClose={close} />));
    slowEdgeDrag();
    expect(edge().style.transition).toBe("none");
    act(() => { vi.advanceTimersByTime(0); });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("swipe actions", () => {
  it("commits one right/left action, suppresses its click, and accepts the next tap", () => {
    const right = vi.fn(), left = vi.fn(), click = vi.fn();
    act(() => root.render(<Row right={right} left={left} />));
    row().addEventListener("click", click);
    pointer(row(), "pointerdown", 100);
    expect(pointer(row(), "pointermove", 180).defaultPrevented).toBe(false);
    expect(row().parentElement?.dataset.swipeDirection).toBe("right");
    pointer(row(), "pointerup", 180);
    pointer(row(), "pointerup", 180);
    row().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(right).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    // Starting another touch must dispose the previous settling timer.
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 20);
    act(() => { vi.advanceTimersByTime(300); });
    expect(row().style.transform).not.toBe("");
    pointer(row(), "pointerup", 20);
    expect(left).toHaveBeenCalledTimes(1);
    transition(row());
    expect(row().parentElement?.dataset.swipeDirection).toBeUndefined();
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointerup", 100);
    row().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("never commits vertical, sub-threshold, retracted or canceled swipes", () => {
    const right = vi.fn(), left = vi.fn();
    act(() => root.render(<Row right={right} left={left} />));
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 105, 180);
    pointer(row(), "pointermove", 200, 180);
    pointer(row(), "pointerup", 200, 180);
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 140);
    pointer(row(), "pointerup", 140);
    transition(row());
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 190);
    pointer(row(), "pointermove", 110);
    pointer(row(), "pointerup", 110);
    transition(row());
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 190);
    pointer(row(), "pointercancel", 190);
    pointer(row(), "pointerup", 190);
    act(() => { vi.advanceTimersByTime(500); });
    expect(right).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
    expect(row().style.transform).toBe("");
  });

  it("cancels a second touch anywhere and vibrates at most once per gesture", () => {
    const right = vi.fn(), left = vi.fn(), vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    act(() => root.render(<Row right={right} left={left} />));
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 190);
    pointer(row(), "pointermove", 110);
    pointer(row(), "pointermove", 190);
    expect(vibrate).toHaveBeenCalledTimes(1);
    pointer(document.body, "pointerdown", 250, 100, 2);
    pointer(row(), "pointerup", 190);
    act(() => { vi.advanceTimersByTime(500); });
    expect(right).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("preserves mouse controls and disposes a removed/recycled row", () => {
    const right = vi.fn(), left = vi.fn();
    act(() => root.render(<Row right={right} left={left} />));
    pointer(row(), "pointerdown", 100, 100, 1, "mouse");
    pointer(row(), "pointermove", 190, 100, 1, "mouse");
    pointer(row(), "pointerup", 190, 100, 1, "mouse");
    pointer(row().querySelector("button")!, "pointerdown", 100);
    pointer(row(), "pointermove", 190);
    pointer(row(), "pointerup", 190);
    expect(right).not.toHaveBeenCalled();
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 190);
    act(() => root.render(<Row right={right} left={left} id="b" />));
    pointer(row(), "pointerup", 190);
    expect(right).not.toHaveBeenCalled();
    pointer(row(), "pointerdown", 100);
    pointer(row(), "pointermove", 190);
    pointer(row(), "pointerup", 190);
    act(() => root.render(null));
    act(() => { vi.advanceTimersByTime(500); });
    expect(right).toHaveBeenCalledTimes(1);
  });
});
