import React, { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualWindowProps {
  count: number;
  estimateSize: number;
  gap?: number;
  overscan?: number;
  className?: string;
  getItemKey?: (index: number) => React.Key;
  renderItem: (index: number) => React.ReactNode;
}

/** Virtualize rows against the existing reader master scroller. */
export function VirtualWindow({
  count,
  estimateSize,
  gap = 0,
  overscan = 8,
  className,
  getItemKey,
  renderItem,
}: VirtualWindowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    gap,
    overscan,
    getItemKey,
    scrollMargin,
    initialRect: { width: 600, height: 800 },
    measureElement: (element, entry) => {
      const borderBoxSize = entry?.borderBoxSize?.[0];
      return borderBoxSize?.blockSize || element.getBoundingClientRect().height || estimateSize;
    },
  });

  useLayoutEffect(() => {
    const nextScrollElement = rootRef.current?.closest<HTMLElement>(".wreader-master-scroll") ?? null;
    if (nextScrollElement !== scrollElement) setScrollElement(nextScrollElement);
    const nextMargin = rootRef.current?.offsetTop ?? 0;
    if (nextMargin !== scrollMargin) setScrollMargin(nextMargin);
    virtualizer.measure();
  }, [scrollElement, scrollMargin, virtualizer]);

  return (
    <div
      ref={rootRef}
      className={className}
      data-virtual-count={count}
      style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={virtualizer.measureElement}
          style={{
            left: 0,
            position: "absolute",
            top: 0,
            transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            width: "100%",
          }}
        >
          {renderItem(virtualRow.index)}
        </div>
      ))}
    </div>
  );
}
