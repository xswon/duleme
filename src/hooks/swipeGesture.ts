/** Keep selection, controls and horizontal content under their native handlers. */
export function shouldIgnoreSwipe(target: EventTarget | null, root: HTMLElement): boolean {
  if (!window.getSelection()?.isCollapsed) return true;
  if (!(target instanceof Element)) return true;
  if (target.closest("button, a, input, textarea, select, [contenteditable], [role=slider], [data-swipe-ignore]")) return true;
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}

/** One completion path for transition events and the fallback, with explicit disposal. */
export function animateSwipe(el: HTMLElement, x: number, onComplete: () => void): () => void {
  let finished = false;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const dispose = () => {
    finished = true;
    clearTimeout(timer);
    el.removeEventListener("transitionend", onEnd);
  };
  const complete = () => {
    if (finished) return;
    dispose();
    onComplete();
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target === el && event.propertyName === "transform") complete();
  };
  // Flush the last drag position once, before starting the settling transition.
  void el.offsetWidth;
  el.style.transition = reduced ? "none" : "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
  el.style.transform = `translateX(${x}px)`;
  el.addEventListener("transitionend", onEnd);
  const timer = setTimeout(complete, reduced ? 0 : 270);
  return dispose;
}
