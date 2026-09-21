import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), clear: vi.fn() }));
const transcription = vi.hoisted(() => ({ test: vi.fn() }));
const insight = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), test: vi.fn(), save: vi.fn(), clear: vi.fn() }));

vi.mock("../src/services/dbService", () => ({
  getTranscriptionSettings: db.get,
  saveTranscriptionSettings: db.save,
  clearTranscriptionSettings: db.clear,
}));
vi.mock("../src/services/transcriptionService", () => ({ transcriptionApi: { test: transcription.test } }));
vi.mock("../src/services/insightSettingsService", () => ({
  getInsightSettingsStatus: insight.get,
  listInsightModels: insight.list,
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
  providerId: "custom" as const,
  provider: "环境变量",
  baseURL: "https://env.example.com/v1",
  model: "env-model",
  configured: true,
  hasApiKey: false,
  source: "server" as const,
};
const browserInsight = {
  providerId: "openai" as const,
  provider: "OpenAI",
  baseURL: "https://api.openai.com/v1",
  model: "reader-model",
  configured: true,
  hasApiKey: true,
  source: "browser" as const,
};

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
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
    insight.list.mockResolvedValue([
      { id: "reader-model", name: "Reader Model", created: 2 },
      { id: "text-embedding-3-small", created: 3 },
      { id: "fallback-chat", created: 1 },
    ]);
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

  it("lets content organizing use an editable OpenAI-compatible endpoint", async () => {
    insight.get.mockResolvedValueOnce(browserInsight);
    insight.test.mockResolvedValueOnce(123);
    await act(async () => { root.render(<LocalAiSettingsPanel view="insight" panelId="insight" />); });
    await flush();
    expect(node.textContent).toContain("reader-model");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("reader-model")) as HTMLButtonElement).click();
    });
    const provider = node.querySelector("#insight-provider") as HTMLSelectElement;
    const baseURL = node.querySelector("#insight-base-url") as HTMLInputElement;
    const input = node.querySelector("#insight-api-key") as HTMLInputElement;
    const model = node.querySelector("#insight-model") as HTMLInputElement;
    expect(provider.value).toBe("openai");
    expect(baseURL.value).toBe("https://api.openai.com/v1");
    expect(model.value).toBe("reader-model");
    expect(input.placeholder).toContain("已保存");
    expect(node.textContent).toContain("Reader Model");
    expect(node.textContent).not.toContain("text-embedding-3-small");
    await typeInto(input, "user-openai-key");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "测试连接") as HTMLButtonElement).click();
    });
    await flush();
    expect(insight.test).toHaveBeenCalledWith({
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: "user-openai-key",
      model: "reader-model",
    });
    expect(node.textContent).toContain("连接成功 · 123 ms");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "保存") as HTMLButtonElement).click();
    });
    await flush();
    expect(insight.save).toHaveBeenCalledWith({
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: "user-openai-key",
      model: "reader-model",
    });
    expect(node.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps advanced endpoint details hidden from the beginner flow", async () => {
    insight.get.mockResolvedValueOnce(browserInsight);
    await act(async () => { root.render(<LocalAiSettingsPanel view="insight" panelId="insight" />); });
    await flush();
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("reader-model")) as HTMLButtonElement).click();
    });
    await flush();

    const advanced = Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("高级设置")) as HTMLButtonElement;
    const baseURL = node.querySelector("#insight-base-url") as HTMLInputElement;
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
    expect(baseURL.closest(".wreader-model-advanced-body")?.hasAttribute("hidden")).toBe(true);

    await act(async () => { advanced.click(); });
    expect(advanced.getAttribute("aria-expanded")).toBe("true");
    expect(baseURL.closest(".wreader-model-advanced-body")?.hasAttribute("hidden")).toBe(false);
  });

  it("keeps the full content-organizing form visible before a provider is chosen", async () => {
    insight.get.mockResolvedValueOnce({
      providerId: "custom",
      provider: "自定义",
      baseURL: "",
      model: "",
      configured: false,
      hasApiKey: false,
      source: "none" as const,
    });
    await act(async () => { root.render(<LocalAiSettingsPanel view="insight" panelId="insight" />); });
    await flush();
    expect(node.textContent).toContain("尚未配置");
    await act(async () => {
      (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("尚未配置")) as HTMLButtonElement).click();
    });
    const provider = node.querySelector("#insight-provider") as HTMLSelectElement;
    const input = node.querySelector("#insight-api-key") as HTMLInputElement;
    const baseURL = node.querySelector("#insight-base-url") as HTMLInputElement;
    const model = node.querySelector("#insight-model") as HTMLInputElement;
    expect(provider.value).toBe("");
    expect(input.disabled).toBe(true);
    expect(baseURL.disabled).toBe(true);
    expect(model.disabled).toBe(true);
    await choose(provider, "ollama");
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toContain("本机服务可留空");
    expect(baseURL.value).toBe("http://127.0.0.1:11434/v1");
    expect(model.value).toBe("");
  });
});
