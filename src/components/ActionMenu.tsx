import React, { useEffect, useId, useRef, useState } from "react";

interface ActionMenuProps {
  label: string;
  icon: React.ReactNode;
  buttonClassName?: string;
  items: Array<{ label: string; disabled?: boolean; onSelect: () => void }>;
}

// Shared by the subscription heading and list header; each menu owns its focus.
export function ActionMenu({ label, icon, buttonClassName = "", items }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const triggerId = useId();

  useEffect(() => {
    if (!isOpen) return;
    containerRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const handleOutside = (event: Event) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handleOutside, true);
    document.addEventListener("click", handleOutside, true);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
      document.removeEventListener("click", handleOutside, true);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [isOpen]);

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const buttons = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowDown" ? (index + 1) % buttons.length
        : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length : null;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      buttons[next]?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return <div ref={containerRef} className="wreader-action-menu">
    <button ref={triggerRef} id={triggerId} type="button" className={`wreader-icon-button ${buttonClassName}`} aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={isOpen} aria-controls={isOpen ? menuId : undefined}
      onClick={() => setIsOpen((open) => !open)}
      onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIsOpen(true); } }}>
      {icon}
    </button>
    {isOpen && <div id={menuId} role="menu" aria-labelledby={triggerId} className="wreader-action-menu-panel" onKeyDown={handleMenuKeyDown}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled}
        onClick={() => { setIsOpen(false); triggerRef.current?.focus(); item.onSelect(); }}>{item.label}</button>)}
    </div>}
  </div>;
}
