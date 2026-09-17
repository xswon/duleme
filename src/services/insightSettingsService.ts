export type InsightProviderId = "gemini";
export type InsightSettingsSource = "browser" | "server" | "none";

export interface InsightSettingsStatus {
  providerId: InsightProviderId;
  provider: string;
  model: string;
  hasApiKey: boolean;
  source: InsightSettingsSource;
}

export interface InsightSettingsDraft {
  provider: InsightProviderId;
  apiKey?: string;
  model: string;
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => ({}));
  return new Error(payload?.error || fallback);
}

export async function getInsightSettingsStatus(): Promise<InsightSettingsStatus> {
  const response = await fetch("/api/ai/settings", { credentials: "same-origin" });
  if (!response.ok) throw await readError(response, "无法读取内容整理模型状态。");
  return response.json();
}

export async function testInsightSettings(value: InsightSettingsDraft): Promise<void> {
  const response = await fetch("/api/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(value),
  });
  if (!response.ok) throw await readError(response, "连接失败，请检查 API Key。");
}

export async function saveInsightSettings(value: Required<InsightSettingsDraft>): Promise<InsightSettingsStatus> {
  const response = await fetch("/api/ai/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(value),
  });
  if (!response.ok) throw await readError(response, "无法保存内容整理模型配置。");
  return response.json();
}

export async function clearInsightSettings(): Promise<InsightSettingsStatus> {
  const response = await fetch("/api/ai/settings", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw await readError(response, "无法清除内容整理模型配置。");
  return response.json();
}
