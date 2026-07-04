import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash";

/// Calls Gemini with a system persona + user prompt, expecting a JSON object
/// back. Strips markdown code-fences if the model wraps its JSON in one —
/// small models do this often enough that it's worth handling defensively.
export async function askGeminiJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `${systemPrompt}\n\n${userPrompt}`,
  });

  const raw = response.text ?? "";
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(cleaned) as T;
}
