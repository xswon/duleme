import React, { useState } from "react";
import {
  X,
  FolderPlus,
  Trash2,
  Folder,
  Edit2,
  Check,
  ArrowUpDown,
  Rss,
  Plus,
} from "lucide-react";
import { Feed } from "../types";

export type SortMode = "default" | "alphabetical" | "unread";

interface ManageFeedsModalProps {
  isOpen: boolean;
  onClose: () => void;
  feeds: Feed[];
  categories: string[];
  onAddCategory: (categoryName: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
  onUpdateFeedCategory: (feedId: string, newCategory: string) => void;
  onDeleteFeed: (feedId: string) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  initialTab?: "feeds" | "folders" | "sort";
}

export const ManageFeedsModal: React.FC<ManageFeedsModalProps> = ({
  isOpen,
  onClose,
  feeds,
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onUpdateFeedCategory,
  onDeleteFeed,
  sortMode,
  onSortModeChange,
  initialTab = "feeds",
}) => {
  const [activeTab, setActiveTab] = useState<"feeds" | "folders" | "sort">(
    initialTab
  );
  const [newFolderInput, setNewFolderInput] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryInput, setEditCategoryInput] = useState("");

  if (!isOpen) return null;

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderInput.trim()) return;
    onAddCategory(newFolderInput.trim());
    setNewFolderInput("");
  };

  const handleStartRename = (cat: string) => {
    setEditingCategory(cat);
    setEditCategoryInput(cat);
  };

  const handleSaveRename = (oldName: string) => {
    if (editCategoryInput.trim() && editCategoryInput !== oldName) {
      onRenameCategory(oldName, editCategoryInput.trim());
    }
    setEditingCategory(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl text-slate-900 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="font-bold text-lg text-slate-900">设置订阅源</h2>
            <p className="text-xs text-slate-500">
              管理已订阅源、文件夹分类与排序规则
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-50/60 text-xs font-semibold px-6 pt-3 gap-6">
          <button
            onClick={() => setActiveTab("feeds")}
            className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "feeds"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Rss className="w-3.5 h-3.5" />
            <span>订阅源管理 ({feeds.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("folders")}
            className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "folders"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>文件夹管理 ({categories.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("sort")}
            className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "sort"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>排序规则</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: FEEDS MANAGEMENT */}
          {activeTab === "feeds" && (
            <div className="space-y-3">
              {feeds.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  暂无订阅源，请通过"添加订阅"按钮添加 RSS 源。
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50/70 p-1.5 space-y-0.5">
                  {feeds.map((feed) => (
                    <div
                      key={feed.id}
                      className="p-3 rounded-lg flex items-center justify-between gap-3 hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {feed.favicon ? (
                          <img
                            src={feed.favicon}
                            alt=""
                            className="w-4 h-4 rounded shrink-0 object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-4 h-4 rounded bg-blue-500 text-white font-bold text-[9px] flex items-center justify-center shrink-0">
                            {feed.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-semibold text-xs text-slate-900 truncate">
                            {feed.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 truncate">
                            {feed.feedUrl}
                          </p>
                        </div>
                      </div>

                      {/* Folder selector & Delete button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={feed.category || "未分类"}
                          onChange={(e) =>
                            onUpdateFeedCategory(feed.id, e.target.value)
                          }
                          className="bg-white border border-slate-200 rounded-lg text-xs px-2 py-1 text-slate-700 focus:outline-none focus:border-blue-500"
                        >
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => {
                            if (confirm(`确定要删除订阅"${feed.title}"吗？`)) {
                              onDeleteFeed(feed.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="删除订阅"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FOLDERS MANAGEMENT */}
          {activeTab === "folders" && (
            <div className="space-y-4">
              {/* Create new folder form */}
              <form onSubmit={handleCreateFolder} className="flex gap-2">
                <input
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  placeholder="新建文件夹名称 (例如: 科技 | 商业)"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newFolderInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加文件夹</span>
                </button>
              </form>

              {/* List existing folders */}
              <div className="rounded-xl bg-slate-50/70 p-1.5 space-y-0.5">
                {categories.map((cat) => {
                  const catFeedsCount = feeds.filter(
                    (f) => f.category === cat
                  ).length;
                  const isEditing = editingCategory === cat;

                  return (
                    <div
                      key={cat}
                      className="p-3 rounded-lg flex items-center justify-between gap-3 hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        {isEditing ? (
                          <input
                            type="text"
                            value={editCategoryInput}
                            onChange={(e) => setEditCategoryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(cat);
                            }}
                            className="bg-white border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <span className="font-semibold text-xs text-slate-800 truncate">
                            {cat}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          ({catFeedsCount} 个订阅源)
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isEditing ? (
                          <button
                            onClick={() => handleSaveRename(cat)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="保存名称"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartRename(cat)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="重命名文件夹"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `确定要删除文件夹"${cat}"吗？其中订阅源将被移至"未分类"。`
                              )
                            ) {
                              onDeleteCategory(cat);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="删除文件夹"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: SORTING RULES */}
          {activeTab === "sort" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                选择侧边栏订阅源排序规则
              </label>

              <div className="space-y-2">
                <button
                  onClick={() => onSortModeChange("default")}
                  className={`w-full p-3 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                    sortMode === "default"
                      ? "bg-blue-50 text-blue-900 font-semibold"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold">默认排序 (自定义顺序)</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      按照添加顺序和分类逻辑呈现侧边栏列表
                    </p>
                  </div>
                  {sortMode === "default" && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => onSortModeChange("alphabetical")}
                  className={`w-full p-3 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                    sortMode === "alphabetical"
                      ? "bg-blue-50 text-blue-900 font-semibold"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold">按名称字母排序 (A - Z)</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      自动将文件夹和订阅源按照拼音/首字母升序排列
                    </p>
                  </div>
                  {sortMode === "alphabetical" && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => onSortModeChange("unread")}
                  className={`w-full p-3 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                    sortMode === "unread"
                      ? "bg-blue-50 text-blue-900 font-semibold"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold">按未读数由多到少排序</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      未读文章最多的文件夹与订阅源优先置顶展示
                    </p>
                  </div>
                  {sortMode === "unread" && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            完成设置
          </button>
        </div>
      </div>
    </div>
  );
};
