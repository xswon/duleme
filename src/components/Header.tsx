import React from "react";
import {
  Menu,
  RotateCw,
  CheckCheck,
  Search as SearchIcon,
} from "lucide-react";
import { FilterType, ActiveTab } from "../types";

interface HeaderProps {
  activeTab: ActiveTab;
  currentTitle: string;
  filterType: FilterType;
  setFilterType: (filter: FilterType) => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  isRefreshing: boolean;
  onToggleMobileMenu: () => void;
  onNavigateSearch: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTitle,
  filterType,
  setFilterType,
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
      className="h-16 bg-white text-slate-800 sticky top-0 z-30 shrink-0 transition-colors duration-200"
    >
      <div className="max-w-4xl mx-auto w-full h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Left: Mobile Menu Toggle & Title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="打开菜单"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="font-extrabold text-slate-900 text-lg sm:text-xl truncate tracking-tight">
            {currentTitle}
          </h1>
        </div>

        {/* Right Actions Bar */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Mark All Read */}
          <button
            onClick={onMarkAllRead}
            title="全部标为已读"
            className="flex items-center px-2 py-1.5 rounded-lg bg-slate-100/80 hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
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
              {unreadCount > 0 ? `未读 ${unreadCount}` : "未读"}
            </button>
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              全部
            </button>
          </div>

          {/* Quick Search Button */}
          <button
            onClick={onNavigateSearch}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="搜索"
          >
            <SearchIcon className="w-4 h-4" />
          </button>

          {/* Refresh Feeds */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            title="刷新"
          >
            <RotateCw
              className={`w-4 h-4 ${
                isRefreshing ? "animate-spin text-blue-600" : ""
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};
