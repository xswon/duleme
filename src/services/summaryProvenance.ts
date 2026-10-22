import type { Article } from "../types";
import { getInsightSettingsStatus } from "./insightSettingsService";

export async function getSummaryProvenance(): Promise<Article["aiSummaryProvenance"]> {
  try {
    const status = await getInsightSettingsStatus();
    const local = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(status.baseURL);
    return {
      provider: status.provider,
      model: status.model,
      keySource: local ? "local" : status.source === "server" ? "server" : status.hasApiKey ? "personal" : "unknown",
    };
  } catch {
    return { provider: "AI 服务", model: "", keySource: "unknown" };
  }
}

export function summaryProvenanceLabel(value?: Article["aiSummaryProvenance"]): string {
  if (!value) return "摘要来源：AI 生成（旧摘要未记录具体服务与 Key 来源）";
  const source = { personal: "使用你的 Key", server: "使用站点配置", local: "本地模型", unknown: "Key 来源未记录" }[value.keySource];
  return `摘要来源：${value.provider}${value.model ? ` · ${value.model}` : ""}（${source}）`;
}
