import React from "react";
import { X, Keyboard } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "../data/keyboardShortcuts";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl text-slate-900 w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-base text-slate-900">键盘快捷键</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1 text-xs">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.id} className="flex items-center justify-between py-1.5">
              <span className="text-slate-600">{shortcut.label}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 text-blue-700 font-mono font-semibold">
                {shortcut.keys.join(shortcut.joiner ? ` ${shortcut.joiner} ` : " / ")}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
