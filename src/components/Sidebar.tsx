import React, { useState, useRef, useEffect } from "react";
import {
  Bookmark,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Settings,
  FolderPlus,
  ArrowUpDown,
  Newspaper,
  Check,
} from "lucide-react";
import { ActiveTab, Feed } from "../types";
import { SortMode } from "./ManageFeedsModal";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  feeds: Feed[];
  categories: string[];
  selectedFeedId: string | null;
  setSelectedFeedId: (feedId: string | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  totalUnread: number;
  totalSaved: number;
  onOpenAddFeed: () => void;
  onOpenManageFeeds: (tab?: "feeds" | "folders" | "sort") => void;
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  feeds,
  categories,
  selectedFeedId,
  setSelectedFeedId,
  selectedCategory,
  setSelectedCategory,
  totalUnread,
  totalSaved,
  onOpenAddFeed,
  onOpenManageFeeds,
  sortMode,
  setSortMode,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Close sort menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(e.target as Node)
      ) {
        setIsSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ensure categories are expanded by default
  useEffect(() => {
    setExpandedCategories((prev) => {
      const next = { ...prev };
      categories.forEach((cat) => {
        if (next[cat] === undefined) {
          next[cat] = true;
        }
      });
      return next;
    });
  }, [categories]);

  // Combine categories from feeds and explicit list
  const allCategoryNames = Array.from(
    new Set([...categories, ...feeds.map((f) => f.category || "未分类")])
  );

  // Group feeds by category
  const feedsByCategory = allCategoryNames.reduce((acc, cat) => {
    acc[cat] = feeds.filter((f) => (f.category || "未分类") === cat);
    return acc;
  }, {} as Record<string, Feed[]>);

  // Sort categories according to sortMode
  const sortedCategories = [...allCategoryNames].sort((catA, catB) => {
    if (sortMode === "alphabetical") {
      return catA.localeCompare(catB, "zh-CN");
    }
    if (sortMode === "unread") {
      const unreadA = (feedsByCategory[catA] || []).reduce(
        (s, f) => s + f.unreadCount,
        0
      );
      const unreadB = (feedsByCategory[catB] || []).reduce(
        (s, f) => s + f.unreadCount,
        0
      );
      return unreadB - unreadA;
    }
    return 0; // default order
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleSelectAllFeeds = () => {
    setActiveTab("feeds");
    setSelectedFeedId(null);
    setSelectedCategory(null);
    setIsMobileOpen(false);
  };

  const handleSelectCategory = (category: string) => {
    setActiveTab("feeds");
    setSelectedCategory(category);
    setSelectedFeedId(null);
    setIsMobileOpen(false);
  };

  const handleSelectFeed = (feedId: string) => {
    setActiveTab("feeds");
    setSelectedFeedId(feedId);
    setSelectedCategory(null);
    setIsMobileOpen(false);
  };

  const renderFeedAvatar = (feed: Feed) => {
    if (feed.favicon) {
      return (
        <img
          src={feed.favicon}
          alt=""
          className="w-4 h-4 rounded-full object-contain shrink-0"
          onError={(e) => {
            (e.target as HTMLElement).style.display = "none";
          }}
        />
      );
    }
    const label = (feed.title || "RSS").trim().slice(0, 2).toUpperCase();
    return (
      <div className="w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center shrink-0 tracking-tighter">
        {label}
      </div>
    );
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        id="inoreader-sidebar"
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-50 border-r border-slate-200 text-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Header: 订阅源 Title + Action Buttons (Settings, Add Folder, Sort) */}
        <div className="px-4 py-3.5 flex items-center justify-between">
          <h1 className="font-extrabold text-slate-900 text-lg tracking-tight">
            订阅源
          </h1>

          <div className="flex items-center gap-1 text-slate-500 relative" ref={sortMenuRef}>
            {/* 1. Settings icon button (设置订阅源) */}
            <button
              onClick={() => onOpenManageFeeds("feeds")}
              title="设置订阅源 (管理、删除、编辑)"
              className="p-1.5 rounded-lg hover:bg-slate-200/60 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* 2. Add Folder icon button (增加文件夹) */}
            <button
              onClick={() => onOpenManageFeeds("folders")}
              title="增加文件夹 / 分类"
              className="p-1.5 rounded-lg hover:bg-slate-200/60 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            {/* 3. Sort button (排序方式) */}
            <button
              onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
              title="排序方式"
              className={`p-1.5 rounded-lg hover:bg-slate-200/60 hover:text-slate-900 transition-colors cursor-pointer ${
                isSortMenuOpen ? "bg-slate-200/60 text-slate-900" : ""
              }`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {/* Sort Dropdown Menu */}
            {isSortMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg ring-1 ring-slate-900/5 z-50 py-1 text-xs text-slate-700 animate-fadeIn">
                <div className="px-3 py-1.5 font-bold text-[11px] text-slate-400">
                  订阅源排序方式
                </div>
                <button
                  onClick={() => {
                    setSortMode("default");
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    sortMode === "default"
                      ? "text-blue-600 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  <span>默认排序</span>
                  {sortMode === "default" && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => {
                    setSortMode("alphabetical");
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    sortMode === "alphabetical"
                      ? "text-blue-600 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  <span>按名称 (A-Z)</span>
                  {sortMode === "alphabetical" && (
                    <Check className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setSortMode("unread");
                    setIsSortMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    sortMode === "unread"
                      ? "text-blue-600 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  <span>按未读数倒序</span>
                  {sortMode === "unread" && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Sections & Folder Tree */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 text-sm scrollbar-thin">
          {/* Top Main Item: All Feeds */}
          <button
            id="nav-tab-feeds"
            onClick={handleSelectAllFeeds}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === "feeds" && !selectedFeedId && !selectedCategory
                ? "bg-slate-200/80 font-bold text-blue-700"
                : "hover:bg-slate-200/50 text-slate-800"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Newspaper className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold text-sm">全部文章</span>
            </div>
            {/* Right-aligned total unread count (hidden when zero) */}
            {totalUnread > 0 && (
              <span className="text-xs font-semibold text-slate-500 tabular-nums text-right ml-auto shrink-0">
                {totalUnread}
              </span>
            )}
          </button>

          {/* Folder & Feed Tree */}
          <div className="space-y-1 pt-1">
            {sortedCategories.map((category) => {
              const rawFeeds = feedsByCategory[category] || [];

              // Sort feeds inside category according to sortMode
              const sortedFeeds = [...rawFeeds].sort((fA, fB) => {
                if (sortMode === "alphabetical") {
                  return fA.title.localeCompare(fB.title, "zh-CN");
                }
                if (sortMode === "unread") {
                  return fB.unreadCount - fA.unreadCount;
                }
                return 0;
              });

              const isExpanded = expandedCategories[category] ?? true;
              const catUnread = rawFeeds.reduce(
                (sum, f) => sum + f.unreadCount,
                0
              );
              const isSelectedCat =
                activeTab === "feeds" && selectedCategory === category;

              return (
                <div key={category} className="space-y-0.5">
                  {/* Category Folder Row */}
                  <div
                    className={`w-full flex items-center px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                      isSelectedCat
                        ? "bg-slate-200/80 text-blue-700 font-bold"
                        : "hover:bg-slate-200/50 text-slate-800"
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(category);
                      }}
                      className="p-1 text-slate-500 hover:text-slate-800 rounded mr-0.5 cursor-pointer shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div
                      onClick={() => handleSelectCategory(category)}
                      className="flex-1 flex items-center min-w-0 pr-2"
                    >
                      <span className="font-bold text-xs truncate text-slate-800">
                        {category}
                      </span>
                    </div>

                    {/* Right-aligned folder unread count (hidden when zero) */}
                    {catUnread > 0 && (
                      <span className="text-xs font-semibold text-slate-500 tabular-nums text-right ml-auto shrink-0">
                        {catUnread}
                      </span>
                    )}
                  </div>

                  {/* Feed Items under Category */}
                  {isExpanded && (
                    <div className="space-y-0.5">
                      {sortedFeeds.map((feed) => {
                        const isFeedSelected =
                          activeTab === "feeds" && selectedFeedId === feed.id;

                        return (
                          <div
                            key={feed.id}
                            onClick={() => handleSelectFeed(feed.id)}
                            className={`flex items-center justify-between pl-7 pr-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              isFeedSelected
                                ? "bg-slate-200/90 text-blue-700 font-bold"
                                : "hover:bg-slate-200/50 text-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              {renderFeedAvatar(feed)}
                              <span className="truncate text-slate-800 font-medium">
                                {feed.title}
                              </span>
                            </div>

                            {/* Unread number strictly right-aligned (hidden when zero) */}
                            {feed.unreadCount > 0 && (
                              <span className="text-xs font-semibold text-slate-500 tabular-nums text-right ml-auto shrink-0">
                                {feed.unreadCount}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Nav Links: Saved / Search / Add Feed */}
          <div className="space-y-0.5 pt-3">
            <button
              id="nav-tab-saved"
              onClick={() => {
                setActiveTab("saved");
                setSelectedFeedId(null);
                setSelectedCategory(null);
                setIsMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors text-left cursor-pointer ${
                activeTab === "saved"
                  ? "bg-amber-100/80 text-amber-800 font-bold"
                  : "hover:bg-slate-200/50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bookmark className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-medium">收藏文章</span>
              </div>
              {totalSaved > 0 && (
                <span className="text-xs font-semibold text-amber-800 tabular-nums text-right ml-auto shrink-0">
                  {totalSaved}
                </span>
              )}
            </button>

            <button
              id="nav-tab-search"
              onClick={() => {
                setActiveTab("search");
                setSelectedFeedId(null);
                setSelectedCategory(null);
                setIsMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors text-left cursor-pointer ${
                activeTab === "search"
                  ? "bg-blue-100/80 text-blue-700 font-bold"
                  : "hover:bg-slate-200/50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium">搜索全文</span>
              </div>
              <span className="text-[10px] text-slate-400 bg-slate-200/80 px-1.5 py-0.5 rounded font-mono">
                ⌘K
              </span>
            </button>

            <button
              id="nav-tab-add-feed"
              onClick={() => {
                onOpenAddFeed();
                setIsMobileOpen(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors text-left cursor-pointer hover:bg-slate-200/50"
            >
              <div className="flex items-center gap-2.5">
                <Plus className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-600">
                  添加新订阅源
                </span>
              </div>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
