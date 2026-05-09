import OpenAI from "openai";
import { env } from "./env";

// OpenRouter uses the OpenAI SDK with a different base URL
export const openrouter = new OpenAI({
  baseURL: env.OPENROUTER_BASE_URL,
  apiKey: env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://agent-arena.xyz",
    "X-Title": "Agent Arena",
  },
});
