import { AiConfig, AiSecret } from "../types";
import {
  deleteSecretFromDB,
  getAppStateFromDB,
  getSecretFromDB,
  saveAppStateToDB,
  saveSecretToDB,
} from "./dbService";

const AI_SECRET_KEY = "ai";

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  providerPreset: "openai",
  baseURL: "https://api.openai.com/v1",
  model: "",
};

export interface AiCapability {
  configured: boolean;
  baseURL?: string;
  model?: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  const state = await getAppStateFromDB();
  return {
    ...DEFAULT_AI_CONFIG,
    ...(state?.aiConfig || {}),
  };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  const state = (await getAppStateFromDB()) || {};
  await saveAppStateToDB({ ...state, aiConfig: config });
}

export async function getAiSecret(): Promise<AiSecret> {
  return (await getSecretFromDB<AiSecret>(AI_SECRET_KEY)) || { apiKey: "" };
}

export async function saveAiSecret(secret: AiSecret): Promise<void> {
  if (!secret.apiKey) {
    await clearAiSecret();
    return;
  }
  await saveSecretToDB(AI_SECRET_KEY, secret);
}

export async function clearAiSecret(): Promise<void> {
  await deleteSecretFromDB(AI_SECRET_KEY);
}

export async function getAiCapability(): Promise<AiCapability> {
  const [config, secret] = await Promise.all([getAiConfig(), getAiSecret()]);
  const baseURL = config.baseURL.trim();
  const model = config.model.trim();
  const isLocalEndpoint = (() => {
    try {
      const host = new URL(baseURL).hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch {
      return false;
    }
  })();

  return {
    configured: Boolean(config.enabled && baseURL && model && (secret.apiKey.trim() || isLocalEndpoint)),
    baseURL: baseURL || undefined,
    model: model || undefined,
  };
}
