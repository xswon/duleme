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
    { key: "J / K", desc: "下一篇 / 上一篇文章" },
    { key: "← / →", desc: "阅读弹窗内切换上一篇 / 下一篇" },
    { key: "S", desc: "收藏 / 取消收藏当前文章" },
    { key: "M", desc: "标记当前文章已读 / 未读" },
    { key: "R", desc: "刷新全部订阅源" },
    { key: "A", desc: "打开添加订阅源弹窗" },
    { key: "?", desc: "打开本快捷键列表" },
    { key: "Esc", desc: "关闭弹窗" },
  ];

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
          {shortcuts.map((sc) => (
            <div key={sc.key} className="flex items-center justify-between py-1.5">
              <span className="text-slate-600">{sc.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 text-blue-700 font-mono font-semibold">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
