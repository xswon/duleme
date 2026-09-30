import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/Header";

const baseProps = {
  activeTab: "feeds" as const,
  currentTitle: "时间线",
  filterType: "all" as const,
  setFilterType: vi.fn(),
  onRefresh: vi.fn(),
  onMarkAllRead: vi.fn(),
  isRefreshing: false,
  onToggleMobileMenu: vi.fn(),
  unreadCount: 12,
};

describe("Header timeline search", () => {
  it("renders neutral inline search and existing timeline filters together", () => {
    const html = renderToStaticMarkup(
      <Header
        {...baseProps}
        showTimelineFilters
        contentType="article"
        historyWindowDays={60}
        searchQuery="agent"
        onSearchQueryChange={vi.fn()}
        onContentTypeChange={vi.fn()}
        onHistoryWindowDaysChange={vi.fn()}
      />,
    );

    expect(html).toContain('id="timeline-search-input"');
    expect(html).toContain('placeholder="搜索标题、正文、摘要、作者或来源…"');
    expect(html).toContain('value="agent"');
    expect(html).toContain("最近 60 天");
    expect(html).toContain("仅看未读");
    expect(html).toContain('aria-pressed="true">文章');
    expect(html).not.toContain("嘉宾");
  });

  it("keeps search controls out of the saved view", () => {
    const html = renderToStaticMarkup(
      <Header {...baseProps} filterType="starred" showTimelineFilters={false} />,
    );
    expect(html).not.toContain('id="timeline-search-input"');
  });
});
