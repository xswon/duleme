import React from "react";
import {
  Menu,
  RotateCw,
  CheckCheck,
  LayoutGrid,
  Search as SearchIcon,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { FilterType, ViewMode, ActiveTab, ThemeMode } from "../types";

interface HeaderProps {
  activeTab: ActiveTab;
  currentTitle: string;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  filterType: FilterType;
  setFilterType: (filter: FilterType) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  isRefreshing: boolean;
  theme?: ThemeMode;
  setTheme?: (t: ThemeMode) => void;
  onToggleMobileMenu: () => void;
  onNavigateSearch: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  currentTitle,
  viewMode,
  setViewMode,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  onRefresh,
  onMarkAllRead,
  isRefreshing,
  onToggleMobileMenu,
  onNavigateSearch,
  unreadCount,
}) => {
  return (
    <header
      id="inoreader-header"
      className="h-16 bg-white text-slate-800 sticky top-0 z-30 shrink-0 border-b border-slate-100/80 transition-colors duration-200"
    >
      <div className="max-w-4xl mx-auto w-full h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Left: Mobile Menu Toggle & Title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5 min-w-0 group cursor-pointer">
            <h1 className="font-extrabold text-slate-900 text-lg sm:text-xl truncate tracking-tight">
              {currentTitle}
            </h1>
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 group-hover:text-slate-900 transition-colors" />
          </div>
        </div>

        {/* Right Actions Bar */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Mark Read Dropdown Button */}
          <button
            onClick={onMarkAllRead}
            title="Mark All Read"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100/80 hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer text-xs font-semibold"
          >
            <CheckCheck className="w-4 h-4 text-slate-700" />
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {/* Unread / All Filter Pills */}
          <div className="flex items-center bg-slate-100/80 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setFilterType("unread")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                filterType === "unread"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {unreadCount > 0 ? `${unreadCount} Unread` : "Unread"}
            </button>
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All articles
            </button>
          </div>

          {/* Quick Search Button */}
          <button
            onClick={onNavigateSearch}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Search"
          >
            <SearchIcon className="w-4 h-4" />
          </button>

          {/* View Mode Toggle */}
          <button
            onClick={() => {
              if (viewMode === "magazine") setViewMode("card");
              else if (viewMode === "card") setViewMode("list");
              else setViewMode("magazine");
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Switch View Mode"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {/* Refresh Feeds */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh"
          >
            <RotateCw
              className={`w-4 h-4 ${
                isRefreshing ? "animate-spin text-blue-600" : ""
              }`}
            />
          </button>

          {/* More options */}
          <button
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="More"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

