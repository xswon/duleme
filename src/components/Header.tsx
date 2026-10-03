import React from "react";
import { ActionMenu } from "./ActionMenu";
import { ActiveTab, FilterType } from "../types";
import type { TimelineContentFilter } from "../services/router";

function PrototypeIcon({ type, className = "" }: { type: "menu" | "more" | "sort" | "trash" | "eraser"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {type === "menu" && <path d="M4 6h16M4 12h16M4 18h16" />}
      {type === "more" && <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}
      {type === "sort" && <path d="m3 16 4 4 4-4M7 20V4M11 4h10M11 8h7M11 12h4" />}
      {type === "trash" && <><path d="M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>}
      {type === "eraser" && <><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" /><path d="m5.082 11.09 8.828 8.828" /></>}
    </svg>
  );
}

interface HeaderProps {
  activeTab: ActiveTab;
  currentTitle: string;
  currentCountLabel?: string;
  filterType: FilterType;
  setFilterType: (filter: FilterType) => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  isRefreshing: boolean;
  onToggleMobileMenu: () => void;
  /** Legacy prop kept for callers that still render the old search entry point. */
  onNavigateSearch?: () => void;
  unreadCount: number;
  refreshProgress?: { completed: number; total: number; successful: number; failed: number; newArticles: number };
  lastSyncAt?: number;
  timelineSortOrder?: "newest" | "oldest";
  onToggleTimelineSort?: () => void;
  notesEmpty?: boolean;
  playlistEmpty?: boolean;
  favoritesEmpty?: boolean;
  sidebarCollapsed?: boolean;
  showTimelineFilters?: boolean;
  contentType?: TimelineContentFilter;
  onContentTypeChange?: (contentType: TimelineContentFilter) => void;
  historyWindowDays?: number;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sourceOptions?: Array<{ id: string; title: string }>;
  selectedSourceId?: string | null;
  onSourceChange?: (sourceId: string | null) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  currentTitle,
  currentCountLabel: _currentCountLabel,
  filterType,
  onRefresh,
  onMarkAllRead,
  isRefreshing,
  onToggleMobileMenu,
  refreshProgress,
  timelineSortOrder = "newest",
  onToggleTimelineSort,
  notesEmpty = false,
  playlistEmpty = false,
  favoritesEmpty = false,
  sidebarCollapsed = false,
  showTimelineFilters = false,
  contentType = "all",
  onContentTypeChange,
}) => (
  <header id="inoreader-header" className={`wreader-list-header relative z-30 shrink-0 bg-(--wreader-list-bg) text-slate-800 ${showTimelineFilters ? "has-timeline-filters" : ""}`}>
    <div className="wreader-list-header-main flex h-[58px] min-h-[58px] items-center justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onToggleMobileMenu} aria-label="打开导航菜单" aria-controls="inoreader-sidebar" className={`wreader-menu-button wreader-icon-button ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}><PrototypeIcon type="menu" className="h-4 w-4" /></button>
        <h1 className="truncate text-[13px] font-bold text-slate-900">{currentTitle}</h1>
        {isRefreshing && <span className="truncate text-[11px] text-slate-500" aria-live="polite">同步中 {refreshProgress?.completed || 0}/{refreshProgress?.total || ""}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {activeTab === "playlist" ? <>
          <button type="button" onClick={onMarkAllRead} disabled={playlistEmpty} data-tip="清空播放列表" aria-label="清空播放列表" className="wreader-mark-read wreader-icon-button"><PrototypeIcon type="eraser" className="h-4 w-4" /></button>
          {onToggleTimelineSort && <button type="button" onClick={onToggleTimelineSort} title={timelineSortOrder === "newest" ? "排序：按加入顺序" : "排序：按反向加入顺序"} aria-label={timelineSortOrder === "newest" ? "排序：按加入顺序" : "排序：按反向加入顺序"} className="wreader-timeline-sort wreader-icon-button"><PrototypeIcon type="sort" className="h-4 w-4" /></button>}
        </> : activeTab === "notes" ? <>
          <button type="button" onClick={onMarkAllRead} disabled={notesEmpty} data-tip="删除全部笔记" aria-label="删除全部笔记" className="wreader-mark-read wreader-icon-button"><PrototypeIcon type="trash" className="h-4 w-4" /></button>
        </> : activeTab === "feeds" && filterType === "starred" ? <>
          <button type="button" onClick={onMarkAllRead} disabled={favoritesEmpty} data-tip="清空收藏" aria-label="清空收藏" className="wreader-mark-read wreader-icon-button"><PrototypeIcon type="eraser" className="h-4 w-4" /></button>
          {onToggleTimelineSort && <button type="button" onClick={onToggleTimelineSort} title={timelineSortOrder === "newest" ? "排序：从新至旧" : "排序：从旧至新"} aria-label={timelineSortOrder === "newest" ? "排序：从新至旧" : "排序：从旧至新"} className="wreader-timeline-sort wreader-icon-button"><PrototypeIcon type="sort" className="h-4 w-4" /></button>}
        </> : activeTab === "feeds" && <>
          {onToggleTimelineSort && <button type="button" onClick={onToggleTimelineSort} title={timelineSortOrder === "newest" ? "排序：从新至旧" : "排序：从旧至新"} aria-label={timelineSortOrder === "newest" ? "排序：从新至旧" : "排序：从旧至新"} className="wreader-timeline-sort wreader-icon-button"><PrototypeIcon type="sort" className="h-4 w-4" /></button>}
          <ActionMenu key={`${activeTab}-${filterType}-${currentTitle}`} label="更多操作" icon={<PrototypeIcon type="more" className="h-4 w-4" />}
            items={[
              { label: isRefreshing ? "正在刷新" : "刷新订阅", disabled: isRefreshing, onSelect: onRefresh },
              { label: "全部标为已读", onSelect: onMarkAllRead },
            ]} />
        </>}
      </div>
    </div>

    {showTimelineFilters && (
      <div className="wreader-timeline-type-switch" aria-label="内容类型">
        {(["all", "article", "podcast"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={contentType === value ? "is-active" : ""}
            aria-pressed={contentType === value}
            onClick={() => onContentTypeChange?.(value)}
          >
            {value === "all" ? "全部" : value === "article" ? "文章" : "播客"}
          </button>
        ))}
      </div>
    )}
  </header>
);
