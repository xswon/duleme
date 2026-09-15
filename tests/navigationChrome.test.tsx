import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/Header";
import { Sidebar } from "../src/components/Sidebar";
import { SettingsPage } from "../src/components/ManageFeedsModal";
import type { Feed } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const feed = (overrides: Partial<Feed> = {}): Feed => ({
  id: "feed-1",
  title: "科技播客",
  feedUrl: "https://example.com/feed.xml",
  siteUrl: "https://example.com",
  category: "科技",
  unreadCount: 3,
  ...overrides,
});

const sidebarProps = (overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) => ({
  activeTab: "feeds" as const,
  setActiveTab: vi.fn(),
  feeds: [feed()],
  categories: ["科技", "空文件夹"],
  selectedFeedId: null,
  setSelectedFeedId: vi.fn(),
  selectedCategory: null,
  setSelectedCategory: vi.fn(),
  totalUnread: 3,
  totalSaved: 1,
  playlistCount: 2,
  notesCount: 4,
  onOpenAddFeed: vi.fn(),
  sortMode: "default" as const,
  setSortMode: vi.fn(),
  isMobileOpen: false,
  setIsMobileOpen: vi.fn(),
  ...overrides,
});

describe("navigation chrome", () => {
  it("keeps an accessible expand action in the collapsed rail", () => {
    const onCollapse = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Sidebar {...sidebarProps({ isCollapsed: true, onCollapse })} />));
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    expect(toggle).not.toBeNull();
    act(() => toggle?.click());
    expect(onCollapse).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it("simplifies the sidebar while keeping the subscription tree scrollable", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps()} />);

    expect(html).toContain("读了么");
    expect(html).not.toContain("收件箱");
    expect(html).toContain("我的订阅");
    expect(html).not.toContain("搜索全文");
    expect(html).toContain('aria-label="添加订阅或文件夹"');
    expect(html).toContain(">设置<");
    expect(html).toContain("科技");
    expect(html).not.toContain("空文件夹");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('id="subscription-tree-scroll"');
    expect(html).not.toContain(">工具<");
    expect(html.indexOf("收藏")).toBeLessThan(html.indexOf("音频"));
    expect(html.indexOf("音频")).toBeLessThan(html.indexOf("笔记"));
    expect(html.indexOf("笔记")).toBeLessThan(html.indexOf("搜索"));
    expect(html.indexOf("搜索")).toBeLessThan(html.indexOf("科技"));

    const quickEntryOrder = ["时间线", "收藏", "音频", "笔记", "搜索"].map((label) =>
      html.indexOf(label)
    );
    expect(quickEntryOrder).toEqual([...quickEntryOrder].sort((a, b) => a - b));
    expect(html).toContain('id="nav-tab-notes"');
    expect((html.match(/class="wreader-nav-label truncate text-xs"/g) || []).length).toBe(6);
    expect(html).toContain('d="M12.22 2h-.44');
    expect(html).toContain('d="M12 2v2M12 20v2');
    expect(html).not.toContain(">未读<");
    expect(html).toContain('d="m12 3 2.78 5.63');
    expect(html).toContain('d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z"');
  });

  it("marks every utility label for the collapsed rail", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps({ isCollapsed: true })} />);

    expect(html).toContain('class="wreader-nav-label truncate text-xs">音频</span>');
    expect(html).toContain('class="wreader-nav-label truncate text-xs">笔记</span>');
    expect(html).toContain('class="wreader-nav-label truncate text-xs">搜索</span>');
    expect(html).toContain('class="wreader-nav-label truncate text-xs">设置</span>');
  });

  it("keeps refresh and desktop collapse controls in the sidebar header", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps({ onRefresh: vi.fn(), onCollapse: vi.fn() })} />);
    expect(html).toContain('aria-label="刷新订阅源"');
    expect(html).toContain('aria-label="收起侧边栏"');
  });

  it("opens settings as a page and closes the mobile drawer", async () => {
    const setActiveTab = vi.fn();
    const setIsMobileOpen = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Sidebar
          {...sidebarProps({
            isMobileOpen: true,
            setActiveTab,
            setIsMobileOpen,
          })}
        />
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#nav-manage-feeds")?.click();
    });

    expect(setActiveTab).toHaveBeenCalledWith("settings");
    expect(setIsMobileOpen).toHaveBeenCalledWith(false);

    await act(async () => root.unmount());
    container.remove();
  });

  it("creates folders through the subscription add menu and surfaces validation", async () => {
    const onCreateFolder = vi.fn((name: string) => name === "重复" ? "已有同名文件夹" : undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ onCreateFolder })} />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="添加订阅或文件夹"]')?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "添加文件夹")?.click();
    });

    const input = container.querySelector<HTMLInputElement>('input[placeholder="文件夹名称"]');
    expect(input).not.toBeNull();
    const setInputValue = (value: string) => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      if (!input) return;
      setInputValue("重复");
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("已有同名文件夹");

    await act(async () => {
      if (!input) return;
      setInputValue("新文件夹");
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onCreateFolder).toHaveBeenLastCalledWith("新文件夹");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("organizes settings as a modal with merged subscription management", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        feeds={[feed()]}
        categories={["科技"]}
        onAddCategory={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onUpdateFeedCategory={vi.fn()}
        onUpdateFeedUrls={vi.fn()}
        onDeleteFeed={vi.fn()}
        sortMode="default"
        onSortModeChange={vi.fn()}
        onBack={vi.fn()}
        onOpenAddFeed={vi.fn()}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="关闭设置"');
    expect(html).toContain("订阅管理");
    expect(html).toContain("AI 设置");
    expect(html).toContain("数据与备份");
    expect(html).toContain("1 个订阅源");
    expect(html).toContain("搜索订阅");
    expect(html).toContain("添加订阅");
    expect(html).toContain("订阅源");
    expect(html).toContain("文件夹");
    expect(html).not.toContain("显示与排序");
    expect(html).toContain('aria-label="订阅排序"');
    expect(html).toContain('aria-label="文件夹排序"');
    expect(html).toContain('aria-label="科技订阅源"');
    expect(html).toContain("1 个订阅源 · 3 篇未读");
    expect(html).toContain("科技播客");
    expect(html).not.toContain('<span>科技</span><span class="text-blue-600">3 篇未读</span>');
    expect(html).toContain("自定义");
    expect(html).toContain("名称 A–Z");
    expect(html).toContain("未读数量");
    expect(html).not.toContain("https://example.com/feed.xml");
  });

  it("groups local export, recovery, and shortcut help under data settings", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={vi.fn()}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={vi.fn()}
          sortMode="default"
          onSortModeChange={vi.fn()}
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
          onExportBackup={vi.fn()}
          onImportBackup={vi.fn()}
        />
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("数据与备份"))?.click();
    });

    expect(container.textContent).toContain("导出 OPML");
    expect(container.textContent).toContain("导入 OPML");
    expect(container.textContent).toContain("导出完整备份");
    expect(container.textContent).toContain("恢复完整备份");
    expect(container.textContent).toContain("键盘快捷键");

    await act(async () => root.unmount());
    container.remove();
  });

  it("only exposes folder selection while editing a feed", async () => {
    const onUpdateFeedCategory = vi.fn();
    const onUpdateFeedUrls = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技", "商业"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={onUpdateFeedCategory}
          onUpdateFeedUrls={onUpdateFeedUrls}
          onDeleteFeed={vi.fn()}
          feedSortMode="default"
          folderSortMode="default"
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    expect(container.querySelector('[aria-label="更改科技播客所属文件夹"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="科技播客更多操作"]')?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "编辑订阅源")?.click();
    });

    const folderSelect = container.querySelector<HTMLSelectElement>('[aria-label="更改科技播客所属文件夹"]');
    expect(folderSelect).not.toBeNull();
    await act(async () => {
      if (!folderSelect) return;
      folderSelect.value = "商业";
      folderSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title="保存订阅设置"]')?.click();
    });

    expect(onUpdateFeedCategory).toHaveBeenCalledWith("feed-1", "商业");
    expect(onUpdateFeedUrls).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps unread and sync status compactly on the feed title row", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        feeds={[feed({ unreadCount: 2, lastSyncStatus: "error" })]}
        categories={["科技"]}
        onAddCategory={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onUpdateFeedCategory={vi.fn()}
        onUpdateFeedUrls={vi.fn()}
        onDeleteFeed={vi.fn()}
        feedSortMode="default"
        folderSortMode="default"
        onBack={vi.fn()}
        onOpenAddFeed={vi.fn()}
      />
    );

    expect(html).toContain("2 篇未读");
    expect(html).toContain("同步失败");
    expect(html).not.toContain('<span>科技</span><span class="text-blue-600">2 篇未读</span>');
  });

  it("applies custom feed order within each sidebar folder", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <Sidebar
          {...sidebarProps({
            feeds: [
              feed({ id: "a-1", title: "A first", category: "A" }),
              feed({ id: "b-1", title: "B only", category: "B" }),
              feed({ id: "a-2", title: "A second", category: "A" }),
            ],
            categories: ["A", "B"],
            selectedFeedId: "a-2",
            feedSortMode: "default",
            folderSortMode: "default",
            feedOrderByFolder: { A: ["a-2", "a-1"], B: ["b-1"] },
          })}
        />
      );
    });
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="展开B"]')?.click());
    const html = container.innerHTML;

    expect(html.indexOf("A second")).toBeLessThan(html.indexOf("A first"));
    expect(html.indexOf("A first")).toBeLessThan(html.indexOf("B only"));

    act(() => root.unmount());
    container.remove();
  });

  it("opens only the selected folder by default and expands a folder when its feed is selected", async () => {
    const firstFeed = feed({ id: "feed-a", title: "A first", category: "A" });
    const secondFeed = feed({ id: "feed-b", title: "B first", category: "B" });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ feeds: [firstFeed, secondFeed], categories: ["A", "B"], selectedFeedId: "feed-a" })} />);
    });
    expect(container.textContent).toContain("A first");
    expect(container.textContent).not.toContain("B first");

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ feeds: [firstFeed, secondFeed], categories: ["A", "B"], selectedFeedId: "feed-b" })} />);
    });
    expect(container.textContent).toContain("B first");

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ feeds: [{ ...secondFeed, unreadCount: 9 }, firstFeed], categories: ["A", "B"], selectedFeedId: "feed-b" })} />);
    });
    expect(container.textContent).toContain("B first");

    await act(async () => root.unmount());
    container.remove();
  });

  it("closes settings from the modal close control", async () => {
    const onBack = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={vi.fn()}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={vi.fn()}
          sortMode="default"
          onSortModeChange={vi.fn()}
          onBack={onBack}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="关闭设置"]')[1]?.click();
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the list header focused on title, mark-read, sort, and refresh", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="feeds"
        currentTitle="全部订阅"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={8}
        timelineSortOrder="newest"
        onToggleTimelineSort={vi.fn()}
      />
    );

    expect(html).not.toContain('aria-label="8 篇未读"');
    expect(html).toContain("全部订阅");
    expect(html).toContain('aria-label="全部标为已读"');
    expect(html).toContain('aria-label="排序：从新至旧"');
    expect(html).toContain('aria-label="刷新订阅源"');
    expect(html).not.toContain('aria-label="搜索"');
    expect(html).not.toContain("更多操作");
  });

  it("reveals the list-header navigation control when the sidebar is collapsed", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="feeds"
        currentTitle="全部订阅"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={8}
        sidebarCollapsed
      />
    );

    expect(html).toContain("is-sidebar-collapsed");
    expect(html).toContain('aria-label="打开导航菜单"');
  });

  it("shows a disabled clear-all control for an empty notes page", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="notes"
        currentTitle="笔记 0 条"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
        notesEmpty
      />
    );

    expect(html).toContain('aria-label="删除全部笔记"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-label="全部标为已读"');
  });

  it("renders timeline type and unread filters and dispatches their changes", async () => {
    const setFilterType = vi.fn();
    const onContentTypeChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <Header
        activeTab="feeds"
        currentTitle="时间线"
        filterType="all"
        setFilterType={setFilterType}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={37}
        showTimelineFilters
        contentType="all"
        onContentTypeChange={onContentTypeChange}
        historyWindowDays={30}
      />
    ));
    expect(container.textContent).toContain("最近 30 天");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "播客")?.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("仅看未读"))?.click());
    expect(onContentTypeChange).toHaveBeenCalledWith("podcast");
    expect(setFilterType).toHaveBeenCalledWith("unread");
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the unread filter when navigating between feed and folder scopes", async () => {
    const onNavigate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...sidebarProps({ filterType: "unread", selectedFeedId: "feed-1", onNavigate })} />));
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("科技播客"))?.click());
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ filterType: "unread", selectedFeedId: "feed-1" }));
    await act(async () => root.unmount());
    container.remove();
  });

  it("caps large unread badges while retaining the exact accessible count", () => {
    const html = renderToStaticMarkup(
      <Sidebar {...sidebarProps({ totalUnread: 120, feeds: [feed({ unreadCount: 120 })] })} />
    );
    expect(html).toContain(">99+<");
    expect(html).toContain('aria-label="120 篇未读"');
  });

});
