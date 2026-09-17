export interface InsightSettingsStatus {
  provider: string;
  model: string;
  hasApiKey: boolean;
  managedBy: "server";
}

export async function getInsightSettingsStatus(): Promise<InsightSettingsStatus> {
  const response = await fetch("/api/ai/settings");
  if (!response.ok) throw new Error("无法读取内容整理模型状态。");
  return response.json();
}
