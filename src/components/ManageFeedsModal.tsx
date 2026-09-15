import React, { useMemo, useState } from "react";
import {
  X,
  Folder,
  Check,
  Search,
  GripVertical,
  MoreHorizontal,
  Download,
  Upload,
  Database,
  Keyboard,
} from "lucide-react";
import { Feed } from "../types";
import { LocalAiSettingsPanel } from "./LocalAiSettingsModal";
import { exportOpml } from "../services/rssService";
import { feedCategory, orderFeedsInFolder, reorderItems, sortCategories, sortFeedsInFolder, type FeedOrderByFolder, SortMode } from "../services/feedSorting";
export type { SortMode } from "../services/feedSorting";

const SortControl: React.FC<{ value: SortMode; onChange: (mode: SortMode) => void; label: string }> = ({ value, onChange, label }) => (
  <label className="flex items-center gap-1.5 text-xs text-slate-500">
    <span>{label}</span>
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as SortMode)}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="default">自定义拖动</option>
      <option value="alphabetical">名称 A–Z</option>
      <option value="unread">未读数量</option>
    </select>
  </label>
);

const DragHandle: React.FC<{ disabled: boolean; label: string }> = ({ disabled, label }) => (
  <span
    aria-label={label}
    title={disabled ? "当前排序模式不可拖动" : label}
    aria-disabled={disabled}
    className={`shrink-0 rounded p-1 ${disabled ? "cursor-not-allowed text-slate-200" : "cursor-grab text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}
  >
    <GripVertical className="h-4 w-4" />
  </span>
);

interface SettingsPageProps {
  feeds: Feed[];
  categories: string[];
  onAddCategory: (categoryName: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
  onUpdateFeedCategory: (feedId: string, newCategory: string) => void;
  onUpdateFeedUrls: (
    feedId: string,
    urls: { feedUrl: string; bidclubFeedUrl?: string }
  ) => void;
  onDeleteFeed: (feedId: string) => void;
  feedSortMode?: SortMode;
  folderSortMode?: SortMode;
  onFeedSortModeChange?: (mode: SortMode) => void;
  onFolderSortModeChange?: (mode: SortMode) => void;
  feedOrderByFolder?: FeedOrderByFolder;
  onReorderFolderFeeds?: (category: string, feedIds: string[]) => void;
  /** @deprecated Global feed reorder is no longer used. */
  onReorderFeeds?: (feeds: Feed[]) => void;
  onReorderCategories?: (categories: string[]) => void;
  /** @deprecated Kept for callers from the previous single-sort settings page. */
  sortMode?: SortMode;
  onSortModeChange?: (mode: SortMode) => void;
  onBack: () => void;
  onOpenAddFeed: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  feeds,
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onUpdateFeedCategory,
  onUpdateFeedUrls,
  onDeleteFeed,
  feedSortMode,
  folderSortMode,
  onFeedSortModeChange,
  onFolderSortModeChange,
  feedOrderByFolder = {},
  onReorderFolderFeeds,
  onReorderFeeds,
  onReorderCategories,
  sortMode,
  onSortModeChange,
  onBack,
  onOpenAddFeed,
  onExportBackup,
  onImportBackup,
}) => {
  const [activeTab, setActiveTab] = useState<"subscriptions" | "ai" | "data">("subscriptions");
  const [isFolderComposerOpen, setIsFolderComposerOpen] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryInput, setEditCategoryInput] = useState("");
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editFeedCategoryInput, setEditFeedCategoryInput] = useState("");
  const [editFeedUrlInput, setEditFeedUrlInput] = useState("");
  const [editBidclubFeedUrlInput, setEditBidclubFeedUrlInput] = useState("");
  const [feedSearchQuery, setFeedSearchQuery] = useState("");
  const [expandedFeedGroups, setExpandedFeedGroups] = useState<Record<string, boolean>>({});
  const [openMoreMenu, setOpenMoreMenu] = useState<string | null>(null);
  const effectiveFeedSortMode = feedSortMode ?? sortMode ?? "default";
  const effectiveFolderSortMode = folderSortMode ?? sortMode ?? "default";

  const feedCategories = Array.from(
    new Set([...categories, ...feeds.map((feed) => feed.category || "未分类")])
  );
  const normalizedFeedSearch = feedSearchQuery.trim().toLocaleLowerCase();
  const sortedCategories = useMemo(
    () => sortCategories(feedCategories, feeds, effectiveFolderSortMode),
    [feedCategories, feeds, effectiveFolderSortMode]
  );
  const matchingFeeds = feeds.filter((feed) => {
    if (!normalizedFeedSearch) return true;
    return [feed.title, feed.category || "未分类", feed.feedUrl]
      .some((value) => value.toLocaleLowerCase().includes(normalizedFeedSearch));
  });
  const filteredFeeds = normalizedFeedSearch
    ? sortedCategories.flatMap((category) => sortFeedsInFolder(matchingFeeds, category, effectiveFeedSortMode, feedOrderByFolder))
    : [];

  const updateFeedSortMode = (mode: SortMode) => {
    (onFeedSortModeChange || onSortModeChange)?.(mode);
  };
  const updateFolderSortMode = (mode: SortMode) => {
    (onFolderSortModeChange || onSortModeChange)?.(mode);
  };

  const [draggedFeedId, setDraggedFeedId] = useState<string | null>(null);
  const [dragOverFeedId, setDragOverFeedId] = useState<string | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const canDragFeeds = effectiveFeedSortMode === "default" && !normalizedFeedSearch;
  const canDragCategories = effectiveFolderSortMode === "default";

  const moveFeed = (targetId: string) => {
    if (!canDragFeeds || !draggedFeedId || draggedFeedId === targetId) return;
    const draggedFeed = feeds.find((feed) => feed.id === draggedFeedId);
    const targetFeed = feeds.find((feed) => feed.id === targetId);
    if (!draggedFeed || !targetFeed || feedCategory(draggedFeed) !== feedCategory(targetFeed)) {
      setDraggedFeedId(null);
      setDragOverFeedId(null);
      return;
    }
    const category = feedCategory(draggedFeed);
    const folderFeeds = orderFeedsInFolder(feeds, category, feedOrderByFolder);
    const sourceIndex = folderFeeds.findIndex((feed) => feed.id === draggedFeedId);
    const targetIndex = folderFeeds.findIndex((feed) => feed.id === targetId);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      onReorderFolderFeeds?.(category, reorderItems(folderFeeds, sourceIndex, targetIndex).map((feed) => feed.id));
    }
    setDraggedFeedId(null);
    setDragOverFeedId(null);
  };

  const moveCategory = (targetCategory: string) => {
    if (!canDragCategories || !draggedCategory || draggedCategory === targetCategory) return;
    const sourceIndex = categories.indexOf(draggedCategory);
    const targetIndex = categories.indexOf(targetCategory);
    if (sourceIndex >= 0 && targetIndex >= 0) onReorderCategories?.(reorderItems(categories, sourceIndex, targetIndex));
    setDraggedCategory(null);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderInput.trim()) return;
    onAddCategory(newFolderInput.trim());
    setNewFolderInput("");
    setIsFolderComposerOpen(false);
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

  const handleStartEditFeed = (feed: Feed) => {
    setEditingFeedId(feed.id);
    setEditFeedCategoryInput(feed.category || "未分类");
    setEditFeedUrlInput(feed.feedUrl);
    setEditBidclubFeedUrlInput(feed.bidclubFeedUrl || "");
  };

  const handleCancelEditFeed = () => {
    setEditingFeedId(null);
    setEditFeedCategoryInput("");
    setEditFeedUrlInput("");
    setEditBidclubFeedUrlInput("");
  };

  const handleSaveFeedUrls = (feed: Feed) => {
    const feedUrl = editFeedUrlInput.trim();
    if (!feedUrl) return;
    onUpdateFeedUrls(feed.id, {
      feedUrl,
      bidclubFeedUrl: editBidclubFeedUrlInput.trim() || undefined,
    });
    if (editFeedCategoryInput && editFeedCategoryInput !== (feed.category || "未分类")) {
      onUpdateFeedCategory(feed.id, editFeedCategoryInput);
    }
    handleCancelEditFeed();
  };

  const renderFeedRow = (feed: Feed, category: string) => {
    const isEditingFeed = editingFeedId === feed.id;
    const isDragTarget = dragOverFeedId === feed.id && draggedFeedId !== feed.id;
    const draggedFeed = draggedFeedId
      ? feeds.find((candidate) => candidate.id === draggedFeedId)
      : undefined;
    const isSameFolderDrag = !!draggedFeed && feedCategory(draggedFeed) === category;
    let feedHost = feed.feedUrl;
    try {
      feedHost = new URL(feed.feedUrl).hostname.replace(/^www\./, "");
    } catch {
      // Preserve the stored URL when legacy data is not a complete URL.
    }
    return (
      <div
        key={feed.id}
        onDragOver={(event) => {
          if (canDragFeeds && isSameFolderDrag) {
            event.preventDefault();
            setDragOverFeedId(feed.id);
          }
        }}
        onDrop={() => moveFeed(feed.id)}
        className={`wreader-settings-feed-row flex transition-colors hover:bg-white ${isEditingFeed ? "flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between" : "flex-row items-center justify-between gap-2 rounded-lg px-2 py-1.5"} ${draggedFeedId === feed.id ? "opacity-50" : ""} ${isDragTarget ? "ring-2 ring-blue-300" : ""}`}
      >
        <div className={`flex min-w-0 flex-1 ${isEditingFeed ? "items-start gap-2.5" : "items-center gap-2"}`}>
          <span
            className="wreader-settings-drag"
            draggable={canDragFeeds}
            onDragStart={(event) => {
              if (!canDragFeeds) return;
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", feed.id);
              setDraggedFeedId(feed.id);
              setDragOverFeedId(null);
            }}
            onDragEnd={() => {
              setDraggedFeedId(null);
              setDragOverFeedId(null);
            }}
          >
            <DragHandle disabled={!canDragFeeds} label={`拖动${feed.title}调整${category}内顺序`} />
          </span>
          {feed.favicon ? (
            <img src={feed.favicon} alt="" className="wreader-settings-feed-icon h-4 w-4 shrink-0 rounded object-contain" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
          ) : (
            <div className="wreader-settings-feed-icon flex h-4 w-4 shrink-0 items-center justify-center rounded bg-blue-500 text-[9px] font-bold text-white">
              {feed.title.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className={`min-w-0 flex-1 ${isEditingFeed ? "space-y-2" : ""}`}>
            {isEditingFeed ? (
              <h4 className="truncate text-xs font-semibold text-slate-900">{feed.title}</h4>
            ) : <span className="wreader-settings-feed-copy"><strong>{feed.title}</strong><small>{feedHost}{feed.unreadCount > 0 ? ` · ${feed.unreadCount} 篇未读` : ""}{feed.lastSyncStatus === "error" ? " · 同步失败" : ""}</small></span>}
            {isEditingFeed && (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold text-slate-500">所属文件夹</span>
                  <select
                    value={editFeedCategoryInput}
                    onChange={(event) => setEditFeedCategoryInput(event.target.value)}
                    aria-label={`更改${feed.title}所属文件夹`}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {feedCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </label>
                <label className="grid gap-1"><span className="text-[10px] font-semibold text-slate-500">RSS 链接</span><input type="url" value={editFeedUrlInput} onChange={(e) => setEditFeedUrlInput(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500" placeholder="https://example.com/feed.xml" /></label>
                <label className="grid gap-1"><span className="text-[10px] font-semibold text-slate-500">BidClub 辅助 Feed</span><input type="url" value={editBidclubFeedUrlInput} onChange={(e) => setEditBidclubFeedUrlInput(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500" placeholder="https://bidclub.ai/feeds/example.xml" /></label>
              </div>
            )}
          </div>
        </div>
        <div className="wreader-settings-row-actions flex shrink-0 items-center gap-1 sm:pl-3">
          {isEditingFeed ? <>
            <button onClick={() => handleSaveFeedUrls(feed)} disabled={!editFeedUrlInput.trim()} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 rounded-lg transition-colors" title="保存订阅设置"><Check className="w-4 h-4" /></button>
            <button onClick={handleCancelEditFeed} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="取消"><X className="w-4 h-4" /></button>
          </> : <div className="wreader-settings-more-wrap">
            <button type="button" onClick={() => setOpenMoreMenu((current) => current === `feed:${feed.id}` ? null : `feed:${feed.id}`)} aria-label={`${feed.title}更多操作`} title="更多操作"><MoreHorizontal /></button>
            {openMoreMenu === `feed:${feed.id}` && <div className="wreader-settings-menu"><button type="button" onClick={() => { setOpenMoreMenu(null); handleStartEditFeed(feed); }}>编辑订阅源</button><button type="button" onClick={() => { setOpenMoreMenu(null); handleStartEditFeed(feed); }}>移动到文件夹</button><button type="button" className="danger" onClick={() => { setOpenMoreMenu(null); if (confirm(`确定要删除订阅"${feed.title}"吗？`)) onDeleteFeed(feed.id); }}>删除订阅源</button></div>}
          </div>}
        </div>
      </div>
    );
  };

  return (
    <div className="wreader-settings-modal fixed inset-0 z-[70] grid place-items-center p-6" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onKeyDown={(event) => { if (event.key === "Escape") onBack(); }}>
      <button type="button" className="wreader-settings-backdrop absolute inset-0" onClick={onBack} aria-label="关闭设置" />
      <section className="wreader-settings-card relative flex w-full flex-col overflow-hidden">
        <header className="wreader-settings-header flex shrink-0 items-center justify-between">
          <h1 id="settings-modal-title">设置</h1>
          <button type="button" autoFocus onClick={onBack} aria-label="关闭设置" title="关闭设置" className="wreader-settings-close"><X /></button>
        </header>
        <div className="wreader-settings-body overflow-y-auto scrollbar-thin">
          <div className="wreader-settings-page mx-auto w-full">
        <nav aria-label="设置分类" className="wreader-settings-tabs flex">
          <button
            type="button"
            onClick={() => setActiveTab("subscriptions")}
            aria-current={activeTab === "subscriptions" ? "page" : undefined}
            className={`wreader-settings-tab ${activeTab === "subscriptions" ? "is-active" : ""}`}
          >
            <span>订阅管理</span>
          </button>
          <button type="button" onClick={() => setActiveTab("ai")} aria-current={activeTab === "ai" ? "page" : undefined} className={`wreader-settings-tab ${activeTab === "ai" ? "is-active" : ""}`}><span>AI 设置</span></button>
          <button type="button" onClick={() => setActiveTab("data")} aria-current={activeTab === "data" ? "page" : undefined} className={`wreader-settings-tab ${activeTab === "data" ? "is-active" : ""}`}><span>数据与备份</span></button>
        </nav>

      <div className="min-w-0">
          {/* TAB 1: FEEDS MANAGEMENT */}
          {activeTab === "subscriptions" && (
            <section aria-labelledby="feed-settings-title" className="wreader-settings-panel">
              <div className="wreader-settings-toolbar">
                <div>
                  <h2 id="feed-settings-title">订阅与文件夹</h2>
                  <p>按文件夹管理 {feeds.length} 个订阅源</p>
                </div>
                <div className="wreader-settings-toolbar-actions">
                  <button type="button" onClick={onOpenAddFeed} className="secondary">导入 OPML</button>
                  <button type="button" onClick={onOpenAddFeed}>添加订阅</button>
                  <button type="button" onClick={() => setIsFolderComposerOpen(true)} className="secondary">新建文件夹</button>
                </div>
              </div>

              {isFolderComposerOpen && (
                <form onSubmit={handleCreateFolder} className="wreader-settings-folder-composer">
                  <div className="wreader-settings-folder-dialog">
                    <label><span>文件夹名称</span><input autoFocus type="text" value={newFolderInput} onChange={(event) => setNewFolderInput(event.target.value)} placeholder="例如：待读主题" /></label>
                    <div className="wreader-settings-folder-actions"><button type="button" onClick={() => { setIsFolderComposerOpen(false); setNewFolderInput(""); }}>取消</button><button type="submit" disabled={!newFolderInput.trim()}>创建文件夹</button></div>
                  </div>
                </form>
              )}

              <div className="wreader-settings-filters">
                {feeds.length > 0 ? (
                  <label className="wreader-settings-search">
                    <Search />
                    <input
                        type="search"
                        value={feedSearchQuery}
                        onChange={(event) => setFeedSearchQuery(event.target.value)}
                        aria-label="搜索订阅源"
                        placeholder="搜索订阅源"
                      />
                  </label>
                ) : <span />}
                <SortControl value={effectiveFeedSortMode} onChange={updateFeedSortMode} label="订阅排序" />
                <SortControl value={effectiveFolderSortMode} onChange={updateFolderSortMode} label="文件夹排序" />
              </div>

              {!canDragFeeds && effectiveFeedSortMode === "default" && normalizedFeedSearch && (
                <p className="text-xs text-slate-500">搜索时暂不支持拖动排序，请清除搜索后调整顺序。</p>
              )}

              {feeds.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  暂无订阅源，请通过“添加订阅”按钮添加 RSS 源。
                </div>
              ) : normalizedFeedSearch && filteredFeeds.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  没有匹配的订阅源。
                </div>
              ) : (
                normalizedFeedSearch ? (
                  <div className="wreader-settings-groups" aria-label="搜索结果">
                    {filteredFeeds.map((feed) => renderFeedRow(feed, feedCategory(feed)))}
                  </div>
                ) : (
                  <div className="wreader-settings-groups">
                    {sortedCategories.map((category) => {
                      const groupFeeds = sortFeedsInFolder(feeds, category, effectiveFeedSortMode, feedOrderByFolder);
                      const categoryUnread = groupFeeds.reduce((sum, feed) => sum + feed.unreadCount, 0);
                      const expanded = expandedFeedGroups[category] ?? true;
                      const isEditing = editingCategory === category;
                      return (
                        <section
                          key={category}
                          aria-label={`${category}订阅源`}
                          draggable={canDragCategories}
                          onDragStart={() => canDragCategories && setDraggedCategory(category)}
                          onDragOver={(event) => canDragCategories && event.preventDefault()}
                          onDrop={() => moveCategory(category)}
                          onDragEnd={() => setDraggedCategory(null)}
                          className={`wreader-settings-group ${draggedCategory === category ? "opacity-50" : ""}`}
                        >
                          <div className="wreader-settings-group-heading">
                            <button type="button" onClick={() => setExpandedFeedGroups((previous) => ({ ...previous, [category]: !expanded }))} aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}${category}`} className="wreader-settings-group-toggle">
                              <span className={`wreader-settings-chevron ${expanded ? "is-expanded" : ""}`}>›</span>
                              <span className="wreader-settings-folder-icon"><Folder /></span>
                            </button>
                            {isEditing ? (
                              <input autoFocus value={editCategoryInput} onChange={(event) => setEditCategoryInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleSaveRename(category); if (event.key === "Escape") setEditingCategory(null); }} aria-label={`重命名${category}`} className="wreader-settings-folder-name-input" />
                            ) : <strong className="truncate">{category}</strong>}
                            <small>{groupFeeds.length} 个订阅源 · {categoryUnread} 篇未读</small>
                            <div className="wreader-settings-row-actions">
                              {isEditing ? <button type="button" onClick={() => handleSaveRename(category)} aria-label={`保存${category}`} title="保存"><Check /></button> : <div className="wreader-settings-more-wrap"><button type="button" onClick={() => setOpenMoreMenu((current) => current === `folder:${category}` ? null : `folder:${category}`)} aria-label={`${category}文件夹更多操作`} title="更多操作"><MoreHorizontal /></button>{openMoreMenu === `folder:${category}` && <div className="wreader-settings-menu"><button type="button" onClick={() => { setOpenMoreMenu(null); handleStartRename(category); }}>重命名</button><button type="button" className="danger" onClick={() => { setOpenMoreMenu(null); if (confirm(`确定要删除文件夹"${category}"吗？其中订阅源将被移至"未分类"。`)) onDeleteCategory(category); }}>删除文件夹</button></div>}</div>}
                            </div>
                          </div>
                          {expanded && (groupFeeds.length > 0
                            ? <div className="wreader-settings-group-rows">{groupFeeds.map((feed) => renderFeedRow(feed, category))}</div>
                            : <p className="wreader-settings-empty-group">暂无订阅源，可从其他分组移动至此。</p>)}
                        </section>
                      );
                    })}
                  </div>
                )
              )}

            </section>
          )}

          {activeTab === "ai" && <LocalAiSettingsPanel />}
          {activeTab === "data" && (
            <section aria-labelledby="data-settings-title" className="space-y-6">
              <div className="border-b border-slate-200 pb-5">
                <h2 id="data-settings-title" className="text-lg font-bold text-slate-900">数据与备份</h2>
                <p className="mt-1.5 text-sm text-slate-500">订阅和阅读数据优先保存在本机。定期导出完整备份可避免浏览器数据被清理后无法恢复。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => exportOpml(feeds)} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200 hover:bg-blue-50/20"><Download className="h-5 w-5 text-blue-600" /><strong className="mt-3 block text-sm text-slate-800">导出 OPML</strong><span className="mt-1 block text-xs leading-5 text-slate-500">仅导出订阅源和文件夹，适合迁移到其他阅读器。</span></button>
                <button type="button" onClick={onOpenAddFeed} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200 hover:bg-blue-50/20"><Upload className="h-5 w-5 text-blue-600" /><strong className="mt-3 block text-sm text-slate-800">导入 OPML</strong><span className="mt-1 block text-xs leading-5 text-slate-500">打开添加订阅流程，并报告新增、重复和无效数量。</span></button>
                {onExportBackup && <button type="button" onClick={onExportBackup} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200 hover:bg-blue-50/20"><Database className="h-5 w-5 text-blue-600" /><strong className="mt-3 block text-sm text-slate-800">导出完整备份</strong><span className="mt-1 block text-xs leading-5 text-slate-500">包含订阅、文章、状态、笔记、播放列表和进度。</span></button>}
                {onImportBackup && <label className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200 hover:bg-blue-50/20"><Upload className="h-5 w-5 text-blue-600" /><strong className="mt-3 block text-sm text-slate-800">恢复完整备份</strong><span className="mt-1 block text-xs leading-5 text-slate-500">恢复会替换当前本地业务数据，请先导出当前备份。</span><input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportBackup(file); event.currentTarget.value = ""; }} /></label>}
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2"><Keyboard className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-bold text-slate-800">键盘快捷键</h3></div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs text-slate-600"><dt><kbd>J / K</kbd></dt><dd>下一篇 / 上一篇</dd><dt><kbd>S</kbd></dt><dd>收藏或取消收藏</dd><dt><kbd>M</kbd></dt><dd>标记已读或未读</dd><dt><kbd>R</kbd></dt><dd>刷新订阅</dd><dt><kbd>⌘ / Ctrl + K</kbd></dt><dd>搜索</dd><dt><kbd>Esc</kbd></dt><dd>关闭详情或退出沉浸阅读</dd></dl>
              </div>
            </section>
          )}
        </div>
      </div>
        </div>
      </section>
    </div>
  );
};
