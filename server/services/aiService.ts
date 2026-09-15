import { GoogleGenAI } from "@google/genai";

export async function summarizeArticle(title: string, content?: string, snippet?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured in secrets.");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
