import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), clear: vi.fn() }));
const transcription = vi.hoisted(() => ({ test: vi.fn() }));
const insight = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../src/services/dbService", () => ({ getTranscriptionSettings: db.get, saveTranscriptionSettings: db.save, clearTranscriptionSettings: db.clear }));
vi.mock("../src/services/transcriptionService", () => ({ transcriptionApi: { test: transcription.test } }));
vi.mock("../src/services/insightSettingsService", () => ({ getInsightSettingsStatus: insight.get }));
import { LocalAiSettingsPanel } from "../src/components/LocalAiSettingsModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const saved = { provider: "aliyun" as const, apiKey: "sk-saved-key", language: "auto", diarization: true, contextEnhancement: true };
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
describe("AI model settings modals", () => {
  let node: HTMLDivElement; let root: ReturnType<typeof createRoot>;
  beforeEach(async () => { db.get.mockResolvedValue(saved); db.save.mockResolvedValue(undefined); db.clear.mockResolvedValue(undefined); transcription.test.mockResolvedValue({ ok: true }); insight.get.mockResolvedValue({ provider: "Google Gemini", model: "gemini-2.5-flash", hasApiKey: true, managedBy: "server" }); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
  afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.clearAllMocks(); });
  it("opens a transcription draft, supports key visibility and discards it on cancel", async () => {
    await act(async () => { root.render(<LocalAiSettingsPanel panelId="transcription" />); }); await flush();
    expect(node.textContent).toContain("Qwen Audio 3.0 ASR Flash Filetrans");
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("Qwen Audio")) as HTMLButtonElement).click(); });
    const input = node.querySelector("#ai-api-key") as HTMLInputElement; expect(input.type).toBe("password");
    await act(async () => { (node.querySelector('[aria-label="显示 API Key"]') as HTMLButtonElement).click(); }); expect(input.type).toBe("text");
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "取消") as HTMLButtonElement).click(); });
    expect(node.querySelector('[role="dialog"]')).toBeNull(); expect(db.save).not.toHaveBeenCalled();
  });
  it("tests then saves transcription configuration and keeps daily settings independent", async () => {
    await act(async () => { root.render(<LocalAiSettingsPanel panelId="transcription" />); }); await flush();
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("Qwen Audio")) as HTMLButtonElement).click(); });
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "测试连接") as HTMLButtonElement).click(); }); await flush();
    expect(transcription.test).toHaveBeenCalledWith("sk-saved-key"); expect(node.textContent).toContain("连接成功");
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "保存") as HTMLButtonElement).click(); }); await flush();
    expect(db.save).toHaveBeenCalledWith(saved);
  });
  it("opens and closes the content-organizing model modal without sharing transcription credentials", async () => {
    await act(async () => { root.render(<LocalAiSettingsPanel view="insight" panelId="insight" />); }); await flush();
    expect(node.textContent).toContain("gemini-2.5-flash");
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent?.includes("gemini-2.5-flash")) as HTMLButtonElement).click(); });
    expect(node.textContent).toContain("由服务端环境变量管理");
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "测试连接") as HTMLButtonElement).click(); }); await flush();
    expect(insight.get).toHaveBeenCalledTimes(2); expect(node.textContent).toContain("服务端配置可用");
    await act(async () => { (Array.from(node.querySelectorAll("button")).find((button) => button.textContent === "取消") as HTMLButtonElement).click(); }); expect(node.querySelector('[role="dialog"]')).toBeNull();
  });
});
