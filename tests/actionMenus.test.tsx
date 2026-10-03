import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu } from "../src/components/ActionMenu";
import { Header } from "../src/components/Header";
import { Sidebar } from "../src/components/Sidebar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;

async function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(element));
}

afterEach(async () => { await act(() => root?.unmount()); container?.remove(); });
const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
  .find((item) => item.getAttribute("aria-label") === label || item.textContent === label)!;
const click = async (label: string) => { await act(() => button(label).click()); };
const key = async (value: string) => { await act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }))); };

const headerProps: React.ComponentProps<typeof Header> = {
  activeTab: "feeds", currentTitle: "时间线", filterType: "all", setFilterType: vi.fn(),
  onRefresh: vi.fn(), onMarkAllRead: vi.fn(), isRefreshing: false, onToggleMobileMenu: vi.fn(),
  unreadCount: 3, onToggleTimelineSort: vi.fn(),
};
const sidebarProps: React.ComponentProps<typeof Sidebar> = {
  activeTab: "feeds", setActiveTab: vi.fn(), feeds: [], categories: [], selectedFeedId: null,
  setSelectedFeedId: vi.fn(), selectedCategory: null, setSelectedCategory: vi.fn(),
  totalUnread: 0, totalSaved: 0, playlistCount: 0, notesCount: 0,
  onOpenAddFeed: vi.fn(), isMobileOpen: false, setIsMobileOpen: vi.fn(),
};

describe("reader action menus", () => {
  it.each(["时间线", "订阅源", "文件夹"])("keeps refresh and mark-read inside the %s menu", async (currentTitle) => {
    const onRefresh = vi.fn();
    const onMarkAllRead = vi.fn();
    const onToggleTimelineSort = vi.fn();
    await render(<Header {...headerProps} {...{ currentTitle, onRefresh, onMarkAllRead, onToggleTimelineSort }} />);
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
    expect(container.querySelectorAll('.wreader-list-header-main > div:last-child button')).toHaveLength(2);
    await click("排序：从新至旧");
    expect(onToggleTimelineSort).toHaveBeenCalledTimes(1);
    await click("更多操作");
    expect(button("更多操作").getAttribute("aria-expanded")).toBe("true");
    expect(Array.from(container.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent)).toEqual(["刷新订阅", "全部标为已读"]);
    await click("刷新订阅");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await click("更多操作");
    await click("全部标为已读");
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    expect(button("更多操作").getAttribute("aria-expanded")).toBe("false");
  });

  it("uses live sync state to disable repeat refresh while retaining progress feedback", async () => {
    const onRefresh = vi.fn();
    await render(<Header {...headerProps} onRefresh={onRefresh} />);
    await click("更多操作");
    await act(() => root.render(<Header {...headerProps} onRefresh={onRefresh} isRefreshing refreshProgress={{ completed: 2, total: 4, successful: 2, failed: 0, newArticles: 1 }} />));
    expect(button("正在刷新").disabled).toBe(true);
    await click("正在刷新");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("同步中 2/4");
    await act(() => root.render(<Header {...headerProps} onRefresh={onRefresh} />));
    await click("刷新订阅");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    { activeTab: "feeds" as const, filterType: "starred" as const, action: "清空收藏" },
    { activeTab: "playlist" as const, action: "清空播放列表" },
    { activeTab: "notes" as const, action: "删除全部笔记" },
    { activeTab: "search" as const, action: null },
  ])("keeps $activeTab operations separate", async ({ action, ...props }) => {
    await render(<Header {...headerProps} {...props} />);
    expect(container.querySelector('[aria-label="更多操作"]')).toBeNull();
    expect(container.textContent).not.toContain("刷新订阅");
    expect(container.querySelector('[aria-label="全部标为已读"]')).toBeNull();
    if (action) expect(button(action)).toBeTruthy();
    else expect(container.querySelector('.wreader-list-header-main > div:last-child')?.childElementCount).toBe(0);
  });

  it.each([false, true])("keeps one active search entry under notes with collapsed=%s", async (isCollapsed) => {
    const onNavigate = vi.fn();
    await render(<Sidebar {...sidebarProps} isCollapsed={isCollapsed} activeTab="search" onNavigate={onNavigate} />);
    expect(container.querySelectorAll('[aria-label="搜索"]')).toHaveLength(1);
    const tools = container.querySelector('[aria-label="快捷入口"]')!;
    expect(Array.from(tools.querySelectorAll("button")).map((item) => item.getAttribute("aria-label"))).toEqual(["播客", "笔记", "搜索"]);
    expect(button("搜索").classList.contains("text-blue-700")).toBe(true);
    await click("搜索");
    expect(onNavigate).toHaveBeenCalledWith({ activeTab: "search", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null });
  });

  it("opens the existing add-feed action and closes the drawer and menu", async () => {
    const onOpenAddFeed = vi.fn();
    const setIsMobileOpen = vi.fn();
    await render(<Sidebar {...sidebarProps} {...{ onOpenAddFeed, setIsMobileOpen }} isMobileOpen />);
    await click("添加订阅或文件夹");
    expect(Array.from(container.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent)).toEqual(["添加订阅源", "添加文件夹"]);
    await click("添加订阅源");
    expect(onOpenAddFeed).toHaveBeenCalledTimes(1);
    expect(setIsMobileOpen).toHaveBeenCalledWith(false);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes on outside click, pointer, Escape and Tab and supports menu keyboard focus", async () => {
    await render(<Header {...headerProps} />);
    await click("更多操作");
    expect(document.activeElement).toBe(button("刷新订阅"));
    await key("ArrowDown");
    expect(document.activeElement).toBe(button("全部标为已读"));
    await key("ArrowDown");
    expect(document.activeElement).toBe(button("刷新订阅"));
    await key("ArrowUp");
    expect(document.activeElement).toBe(button("全部标为已读"));
    await key("Home");
    expect(document.activeElement).toBe(button("刷新订阅"));
    await key("End");
    expect(document.activeElement).toBe(button("全部标为已读"));
    await key("Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(button("更多操作"));
    await key("ArrowDown");
    await key("Tab");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await click("更多操作");
    await act(() => document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await click("更多操作");
    await act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await click("更多操作");
    await click("更多操作");
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("dismisses the add menu before closing the mobile drawer on Escape", async () => {
    const setIsMobileOpen = vi.fn();
    await render(<Sidebar {...sidebarProps} setIsMobileOpen={setIsMobileOpen} isMobileOpen />);
    await click("添加订阅或文件夹");
    await key("Escape");
    expect(setIsMobileOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("添加订阅或文件夹"));
    await key("Escape");
    expect(setIsMobileOpen).toHaveBeenCalledWith(false);
  });

  it("keeps the two menus mutually exclusive and clears more when navigating", async () => {
    await render(<><Sidebar {...sidebarProps} /><Header {...headerProps} /></>);
    await click("添加订阅或文件夹");
    await click("更多操作");
    expect(button("添加订阅或文件夹").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll('[role="menu"]')).toHaveLength(1);
    await act(() => root.render(<><Sidebar {...sidebarProps} /><Header {...headerProps} currentTitle="订阅源" /></>));
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("skips disabled items when opening and navigating by keyboard", async () => {
    await render(<ActionMenu label="测试菜单" icon={<span>...</span>} items={[
      { label: "禁用", disabled: true, onSelect: vi.fn() }, { label: "可用", onSelect: vi.fn() },
    ]} />);
    await click("测试菜单");
    expect(document.activeElement).toBe(button("可用"));
    await key("ArrowDown");
    expect(document.activeElement).toBe(button("可用"));
    await act(() => button("测试菜单").focus());
    await key("Escape");
    await key("ArrowUp");
    expect(document.activeElement).toBe(button("可用"));
  });
});
