import { GoogleGenAI } from "@google/genai";

export const INSIGHT_PROVIDER_ID = "gemini";
export const INSIGHT_PROVIDER = "Google Gemini";
export const INSIGHT_MODEL = "gemini-2.5-flash";

export type InsightSettingsSource = "browser" | "server" | "none";

export function getInsightSettings(browserApiKey?: string) {
  const hasBrowserKey = Boolean(browserApiKey?.trim());
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const source: InsightSettingsSource = hasBrowserKey ? "browser" : hasServerKey ? "server" : "none";
  return {
    providerId: INSIGHT_PROVIDER_ID,
    provider: INSIGHT_PROVIDER,
    model: INSIGHT_MODEL,
    hasApiKey: source !== "none",
    source,
  };
}

function resolveInsightApiKey(browserApiKey?: string): string {
  const apiKey = browserApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Google Gemini API Key is not configured.");
  return apiKey;
}

function assertSupportedModel(model?: string): string {
  const selected = model?.trim() || INSIGHT_MODEL;
  if (selected !== INSIGHT_MODEL) throw new Error("Unsupported content-organizing model.");
  return selected;
}

export async function testInsightConnection(apiKeyOverride?: string, model?: string): Promise<void> {
  const apiKey = resolveInsightApiKey(apiKeyOverride);
  const ai = new GoogleGenAI({ apiKey });
  await ai.models.generateContent({
    model: assertSupportedModel(model),
    contents: "Reply with OK.",
  });
}

export async function summarizeArticle(
  title: string,
  content?: string,
  snippet?: string,
  apiKeyOverride?: string,
): Promise<string> {
  const apiKey = resolveInsightApiKey(apiKeyOverride);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: INSIGHT_MODEL,
    contents: `You are an expert news and RSS article assistant for Inoreader.
Please analyze the following article and provide:
1. A concise 2-3 sentence executive summary.
2. 3 key takeaways (bullet points).
3. Estimated reading time in minutes.
Article Title: ${title || "Untitled"}
Article Excerpt / Content: ${content ? content.slice(0, 3000) : snippet || ""}
Respond in clean markdown formatted with bullet points.`,
  });
  return response.text || "Could not generate summary.";
}
