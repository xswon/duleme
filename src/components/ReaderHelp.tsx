import React, { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";

export function ReaderHelp({ label, children }: { label: string; children: React.ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const visible = pinned || hovered;

  useEffect(() => {
    if (!visible) return;
    const close = () => { setPinned(false); setHovered(false); };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [visible]);

  return <span ref={ref} className="reader-help" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setPinned(false); setHovered(false); }
    }}>
    <button type="button" className="reader-help-trigger" aria-label={label} aria-expanded={visible}
      aria-controls={id} onClick={() => setPinned((value) => !value)}>
      <CircleHelp aria-hidden="true" />
    </button>
    {visible && <span id={id} className="reader-help-content" role="note">{children}</span>}
  </span>;
}
