import { openrouter } from "../../config/openrouter";
import { env } from "../../config/env";
import { LLMCallOptions } from "../../types";

// ========== Model Routing Config ==========
// Ordered by preference — falls back down the list on failure
const MODEL_TIERS = {
  premium: [
    "openai/gpt-5.2-chat",
    "openai/gpt-4o",
    "google/gemini-2.5-flash",
  ],
  fast: [
    "google/gemini-2.5-flash",
    "openai/gpt-4o-mini",
    "openai/gpt-5.2-chat",
  ],
  judge: [
    "openai/gpt-5.2-chat", // Best for impartial judging
    "openai/gpt-4o",
  ],
};

export type ModelTier = keyof typeof MODEL_TIERS;

// ========== Simple Cache (in-memory) ==========
const responseCache = new Map<string, { response: string; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(options: LLMCallOptions): string {
  // Only cache deterministic calls (low temperature)
  if ((options.temperature ?? 0.7) > 0.3) return "";
  return JSON.stringify({
    model: options.model,
    messages: options.messages,
    jsonMode: options.jsonMode,
  });
}

// ========== Cost Tracking ==========
let sessionCost = { calls: 0, inputTokens: 0, outputTokens: 0 };

export function getAICostSummary() {
  return { ...sessionCost };
}

// ========== Core LLM Call with Retry + Fallback ==========

/**
 * Core LLM call via OpenRouter with:
 * - Automatic retry with exponential backoff (3 attempts)
 * - Model fallback (if primary model fails, try next in tier)
 * - Response caching for deterministic calls
 * - Cost tracking
 */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  // Check cache first
  const cacheKey = getCacheKey(options);
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.response;
    }
  }

  // Determine model list for fallback
  const models = options.model
    ? [options.model]
    : MODEL_TIERS.premium;

  let lastError: Error | null = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await openrouter.chat.completions.create({
          model,
          messages: options.messages as any,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          response_format: options.jsonMode
            ? { type: "json_object" }
            : undefined,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Empty LLM response");

        // Track costs
        sessionCost.calls++;
        sessionCost.inputTokens += response.usage?.prompt_tokens || 0;
        sessionCost.outputTokens += response.usage?.completion_tokens || 0;

        // Cache if deterministic
        if (cacheKey) {
          responseCache.set(cacheKey, {
            response: content,
            cachedAt: Date.now(),
          });
          // Evict old entries
          if (responseCache.size > 100) {
            const oldest = responseCache.keys().next().value;
            if (oldest) responseCache.delete(oldest);
          }
        }

        return content;
      } catch (error: any) {
        lastError = error;
        const isRateLimit = error?.status === 429;
        const isServerError = error?.status >= 500;

        console.error(
          `[AI] ${model} attempt ${attempt}/3 failed: ${error.message}`
        );

        if (isRateLimit || isServerError) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Non-retryable error — try next model
        break;
      }
    }
    console.warn(`[AI] All retries exhausted for ${model}, trying next model...`);
  }

  throw new Error(
    `All AI models failed. Last error: ${lastError?.message || "unknown"}`
  );
}

/**
 * Call LLM with a specific model tier for routing
 */
export async function callLLMWithTier(
  tier: ModelTier,
  options: Omit<LLMCallOptions, "model">
): Promise<string> {
  const models = MODEL_TIERS[tier];
  return callLLM({ ...options, model: models[0] });
}

/**
 * Call LLM and parse JSON response with validation
 */
export async function callLLMJson<T>(
  options: LLMCallOptions,
  validate?: (data: unknown) => data is T
): Promise<T> {
  const raw = await callLLM({ ...options, jsonMode: true });

  // Try to extract JSON from response (sometimes LLMs wrap it)
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/```json?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);

    if (validate && !validate(parsed)) {
      throw new Error("Response failed validation");
    }

    return parsed as T;
  } catch (parseError) {
    // Retry once with explicit instruction to return valid JSON
    console.warn("[AI] JSON parse failed, retrying with stricter prompt...");
    const retryRaw = await callLLM({
      ...options,
      jsonMode: true,
      messages: [
        ...options.messages,
        {
          role: "user",
          content:
            "Your previous response was not valid JSON. Please respond with ONLY a valid JSON object, no markdown, no explanation.",
        },
      ],
    });

    try {
      return JSON.parse(retryRaw.trim()) as T;
    } catch {
      throw new Error(
        `Failed to parse LLM JSON after retry: ${retryRaw.substring(0, 200)}`
      );
    }
  }
}
