import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), clear: vi.fn() }));
const transcription = vi.hoisted(() => ({ test: vi.fn() }));
const insight = vi.hoisted(() => ({ get: vi.fn(), test: vi.fn(), save: vi.fn(), clear: vi.fn() }));

vi.mock("../src/services/dbService", () => ({
  getTranscriptionSettings: db.get,
  saveTranscriptionSettings: db.save,
  clearTranscriptionSettings: db.clear,
}));
vi.mock("../src/services/transcriptionService", () => ({ transcriptionApi: { test: transcription.test } }));
vi.mock("../src/services/insightSettingsService", () => ({
  getInsightSettingsStatus: insight.get,
  testInsightSettings: insight.test,
  saveInsightSettings: insight.save,
  clearInsightSettings: insight.clear,
}));

import { LocalAiSettingsPanel } from "../src/components/LocalAiSettingsModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const saved = {
  provider: "aliyun" as const,
  apiKey: "sk-saved-key",
  language: "auto",
  diarization: true,
  contextEnhancement: true,
};
const serverInsight = {
  providerId: "gemini" as const,
  provider: "Google Gemini",
  model: "gemini-2.5-flash",
  hasApiKey: true,
  source: "server" as const,
};
const browserInsight = { ...serverInsight, source: "browser" as const };

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AI model settings modals", () => {
  let node: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    db.get.mockResolvedValue(saved);
    db.save.mockResolvedValue(undefined);
    db.clear.mockResolvedValue(undefined);
    transcription.test.mockResolvedValue({ ok: true });
    insight.get.mockResolvedValue(serverInsight);
    insight.test.mockResolvedValue(undefined);
    insight.save.mockResolvedValue(browserInsight);
    insight.clear.mockResolvedValue(serverInsight);
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
    vi.clearAllMocks();
  });

  it("keeps the full transcription form visible before a provider is chosen", async () => {
    db.get.mockResolvedValueOnce(null);
    await act(async () => { root.render(<LocalAiSettingsPanel panelId="transcription" />); });
    await flush();
    expect(node.textContent).toContain("尚未配置");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("尚未配置")) as HTMLButtonElement).click();
    });
    const provider = node.querySelector("#ai-provider") as HTMLSelectElement;
    const input = node.querySelector("#ai-api-key") as HTMLInputElement;
    expect(provider.value).toBe("");
    expect(provider.disabled).toBe(false);
    expect(input).not.toBeNull();
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe("请先选择服务商");
    await choose(provider, "aliyun");
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toContain("阿里云百炼");
    expect(node.querySelector('[role="dialog"]')?.textContent).not.toContain("Qwen Audio 3.0 ASR Flash Filetrans");
  });

  it("opens a saved transcription draft, supports key visibility and discards it on cancel", async () => {
    await act(async () => { root.render(<LocalAiSettingsPanel panelId="transcription" />); });
    await flush();
    expect(node.textContent).toContain("Qwen Audio 3.0 ASR Flash Filetrans");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("Qwen Audio")) as HTMLButtonElement).click();
    });
    const provider = node.querySelector("#ai-provider") as HTMLSelectElement;
    expect(provider.value).toBe("aliyun");
    expect(provider.disabled).toBe(false);
    const input = node.querySelector("#ai-api-key") as HTMLInputElement;
    expect(input.type).toBe("password");
    await act(async () => { (node.querySelector('[aria-label="显示 API Key"]') as HTMLButtonElement).click(); });
    expect(input.type).toBe("text");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "取消") as HTMLButtonElement).click();
    });
    expect(node.querySelector('[role="dialog"]')).toBeNull();
    expect(db.save).not.toHaveBeenCalled();
  });

  it("tests then saves transcription configuration and keeps daily settings independent", async () => {
    await act(async () => { root.render(<LocalAiSettingsPanel panelId="transcription" />); });
    await flush();
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("Qwen Audio")) as HTMLButtonElement).click();
    });
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "测试连接") as HTMLButtonElement).click();
    });
    await flush();
    expect(transcription.test).toHaveBeenCalledWith("sk-saved-key");
    expect(node.textContent).toContain("连接成功");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "保存") as HTMLButtonElement).click();
    });
    await flush();
    expect(db.save).toHaveBeenCalledWith(saved);
  });

  it("lets content organizing use a real editable browser API key", async () => {
    await act(async () => { root.render(<LocalAiSettingsPanel view="insight" panelId="insight" />); });
    await flush();
    expect(node.textContent).toContain("Gemini 2.5 Flash");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("Gemini 2.5 Flash")) as HTMLButtonElement).click();
    });
    const provider = node.querySelector("#insight-provider") as HTMLSelectElement;
    expect(provider.value).toBe("gemini");
    expect(provider.disabled).toBe(false);
    const input = node.querySelector("#insight-api-key") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toContain("服务端默认配置");
    await typeInto(input, "user-gemini-key");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "测试连接") as HTMLButtonElement).click();
    });
    await flush();
    expect(insight.test).toHaveBeenCalledWith({ provider: "gemini", apiKey: "user-gemini-key", model: "gemini-2.5-flash" });
    expect(node.textContent).toContain("连接成功");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "保存") as HTMLButtonElement).click();
    });
    await flush();
    expect(insight.save).toHaveBeenCalledWith({ provider: "gemini", apiKey: "user-gemini-key", model: "gemini-2.5-flash" });
    expect(node.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the full content-organizing form visible before a provider is chosen", async () => {
    insight.get.mockResolvedValueOnce({ ...serverInsight, hasApiKey: false, source: "none" as const });
    await act(async () => { root.render(<LocalAiSettingsPanel view="insight" panelId="insight" />); });
    await flush();
    expect(node.textContent).toContain("尚未配置");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("尚未配置")) as HTMLButtonElement).click();
    });
    const provider = node.querySelector("#insight-provider") as HTMLSelectElement;
    const input = node.querySelector("#insight-api-key") as HTMLInputElement;
    expect(provider.value).toBe("");
    expect(input).not.toBeNull();
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe("请先选择服务商");
    await choose(provider, "gemini");
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toContain("Google Gemini");
    expect(node.querySelector('[role="dialog"]')?.textContent).not.toContain("Gemini 2.5 Flash");
  });
});
