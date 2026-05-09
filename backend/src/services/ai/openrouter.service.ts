import { openrouter } from "../../config/openrouter";
import { env } from "../../config/env";
import { LLMCallOptions } from "../../types";

/**
 * Core LLM call via OpenRouter.
 * Every AI feature in the app flows through this function.
 */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const response = await openrouter.chat.completions.create({
    model: options.model || env.OPENROUTER_DEFAULT_MODEL,
    messages: options.messages as any,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1024,
    response_format: options.jsonMode ? { type: "json_object" } : undefined,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from LLM");
  }
  return content;
}

/**
 * Call LLM and parse JSON response
 */
export async function callLLMJson<T>(options: LLMCallOptions): Promise<T> {
  const raw = await callLLM({ ...options, jsonMode: true });
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Failed to parse LLM JSON response: ${raw.substring(0, 200)}`);
  }
}
