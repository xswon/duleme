import {
  clearAiSecret,
  getAiCapability,
  getAiConfig,
  getAiSecret,
  saveAiConfig,
  saveAiSecret,
  testAiConnection,
} from "./aiSettingsService";

export type InsightProviderId = "openai" | "deepseek" | "qwen" | "kimi" | "ollama" | "custom";
export type InsightSettingsSource = "browser" | "server" | "none";

export interface InsightSettingsStatus {
  providerId: InsightProviderId;
  provider: string;
  baseURL: string;
  model: string;
  configured: boolean;
  hasApiKey: boolean;
  source: InsightSettingsSource;
}

export interface InsightSettingsDraft {
  provider: InsightProviderId;
  baseURL: string;
  apiKey?: string;
  model: string;
}

const PROVIDER_NAMES: Record<InsightProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  kimi: "Kimi",
  ollama: "Ollama",
  custom: "自定义",
};

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function asProvider(value?: string): InsightProviderId {
  return value && value in PROVIDER_NAMES ? value as InsightProviderId : "custom";
}

export async function getInsightSettingsStatus(): Promise<InsightSettingsStatus> {
  const [config, secret, capability] = await Promise.all([
    getAiConfig(),
    getAiSecret(),
    getAiCapability(),
  ]);

  if (config.enabled) {
    const providerId = asProvider(config.providerPreset);
    return {
      providerId,
      provider: PROVIDER_NAMES[providerId],
      baseURL: config.baseURL,
      model: config.model,
      configured: capability.configured,
      hasApiKey: Boolean(
        secret.apiKey.trim() &&
        secret.baseURL &&
        normalizeEndpoint(secret.baseURL) === normalizeEndpoint(config.baseURL),
      ),
      source: "browser",
    };
  }

  return {
    providerId: "custom",
    provider: capability.configured ? "环境变量" : "自定义",
    baseURL: capability.baseURL || "",
    model: capability.model || "",
    configured: capability.configured,
    hasApiKey: false,
    source: capability.configured ? "server" : "none",
  };
}

export async function testInsightSettings(value: InsightSettingsDraft): Promise<number> {
  const secret = await getAiSecret();
  const savedMatches = Boolean(
    secret.apiKey.trim() &&
    secret.baseURL &&
    normalizeEndpoint(secret.baseURL) === normalizeEndpoint(value.baseURL),
  );
  return testAiConnection(
    { baseURL: value.baseURL, model: value.model },
    value.apiKey?.trim() || (savedMatches ? secret.apiKey : ""),
  );
}

export async function saveInsightSettings(value: InsightSettingsDraft): Promise<InsightSettingsStatus> {
  const baseURL = value.baseURL.trim();
  const model = value.model.trim();
  await saveAiConfig({
    enabled: true,
    providerPreset: value.provider,
    baseURL,
    model,
  });

  const nextKey = value.apiKey?.trim() || "";
  if (nextKey) {
    await saveAiSecret({ apiKey: nextKey, baseURL });
  } else {
    const secret = await getAiSecret();
    const savedMatches = Boolean(
      secret.apiKey.trim() &&
      secret.baseURL &&
      normalizeEndpoint(secret.baseURL) === normalizeEndpoint(baseURL),
    );
    if (!savedMatches) await clearAiSecret();
  }

  return getInsightSettingsStatus();
}

export async function clearInsightSettings(): Promise<InsightSettingsStatus> {
  const config = await getAiConfig();
  await saveAiConfig({ ...config, enabled: false });
  await clearAiSecret();
  return getInsightSettingsStatus();
}
