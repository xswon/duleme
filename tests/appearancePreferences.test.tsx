import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppearanceControls } from "../src/components/AppearanceControls";
import { APPEARANCE_KEY, applyTheme, parseAppearance, readAppearance, resolveTheme, subscribeAppearance, updateAppearance } from "../src/services/appearancePreferences";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let dark = false;
let listeners: Set<() => void>;
let cleanup: (() => void) | undefined;
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  dark = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return dark; },
    addEventListener: (_: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_: string, callback: () => void) => listeners.delete(callback),
  }));
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  cleanup?.(); cleanup = undefined;
  container.remove();
  document.getElementById("reader-serif-font")?.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const systemChange = (value: boolean) => { dark = value; listeners.forEach(callback => callback()); };

describe("application appearance", () => {
  it("validates saved values and resolves all three preferences", () => {
    for (const value of [null, "broken", "null", '{"theme":"paper","font":42}']) {
      expect(parseAppearance(value)).toEqual({ theme: "system", font: "sans", alignment: "left" });
    }
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("persists independent preferences and restores the resolved theme", () => {
    updateAppearance({ theme: "dark", font: "serif" });
    updateAppearance({ alignment: "justify" });
    expect(readAppearance()).toEqual({ theme: "dark", font: "serif", alignment: "justify" });
    document.documentElement.dataset.theme = "light";
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
  it("responds to system changes only in system mode, and removes listeners", () => {
    cleanup = subscribeAppearance(vi.fn());
    systemChange(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    updateAppearance({ theme: "light" }); systemChange(true);
    expect(document.documentElement.dataset.theme).toBe("light");
    updateAppearance({ theme: "dark" }); systemChange(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    updateAppearance({ theme: "system" });
    expect(document.documentElement.dataset.theme).toBe("light");
    cleanup(); cleanup = undefined;
    expect(listeners.size).toBe(0);
  });
  it("handles cross-window updates and removal", () => {
    const changed = vi.fn();
    cleanup = subscribeAppearance(changed);
    localStorage.setItem(APPEARANCE_KEY, '{"theme":"dark"}');
    window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_KEY }));
    expect(changed).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.theme).toBe("dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(changed).toHaveBeenCalledOnce();
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("still switches in a session when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
    expect(() => updateAppearance({ theme: "dark" })).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    updateAppearance({ theme: "system", font: "sans", alignment: "left" });
  });
  it("keeps global and reading controls synchronized and loads the font only on demand", () => {
    root = createRoot(container);
    act(() => root?.render(<><AppearanceControls /><AppearanceControls typography /></>));
    expect(document.getElementById("reader-serif-font")).toBeNull();
    const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
    act(() => buttons().find(button => button.textContent === "深色")?.click());
    expect(buttons().filter(button => button.textContent === "深色").every(button => button.getAttribute("aria-pressed") === "true")).toBe(true);
    act(() => buttons().find(button => button.textContent === "思源宋体")?.click());
    expect(document.querySelectorAll("#reader-serif-font")).toHaveLength(1);
    act(() => buttons().find(button => button.textContent === "两端对齐")?.click());
    expect(readAppearance()).toEqual({ theme: "dark", font: "serif", alignment: "justify" });
    act(() => root?.render(<AppearanceControls typography />));
    expect(buttons().find(button => button.textContent === "思源宋体")?.getAttribute("aria-pressed")).toBe("true");
  });
  it("applies a dark startup before React, with safe defaults for corrupted storage", () => {
    const script = readFileSync("index.html", "utf8").match(/<script id="appearance-init">([\s\S]*?)<\/script>/)![1];
    for (const [saved, systemDark, expected] of [[null, true, "dark"], ['{"theme":"light"}', true, "light"], ['{"theme":"dark"}', false, "dark"], ["null", false, "light"], ["bad", true, "dark"]] as const) {
      localStorage.clear();
      if (saved) localStorage.setItem(APPEARANCE_KEY, saved);
      dark = systemDark;
      window.eval(script);
      expect(document.documentElement.dataset.theme).toBe(expected);
      expect(document.documentElement.style.colorScheme).toBe(expected);
    }
  });
});
