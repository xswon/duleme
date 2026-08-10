import React from "react";
import { X, Keyboard } from "lucide-react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: "J / K", desc: "Next / Previous article" },
    { key: "S", desc: "Toggle Star / Save article" },
    { key: "M", desc: "Toggle Mark as Read / Unread" },
    { key: "V", desc: "Open original article link in new tab" },
    { key: "A", desc: "Open Add Feed subscription modal" },
    { key: "R", desc: "Refresh all active feeds" },
    { key: "1 / 2 / 3", desc: "Switch view mode (List, Card, Magazine)" },
    { key: "Shift + A", desc: "Mark all visible articles as read" },
    { key: "Esc", desc: "Close reader overlay or modal" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl text-slate-900 w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-base text-slate-900">Inoreader Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {shortcuts.map((sc) => (
            <div key={sc.key} className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">{sc.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 text-blue-700 font-mono font-semibold border border-slate-200">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
