import { prisma } from "../../config/db";
import { callLLMJson } from "./openrouter.service";
import { callLLM } from "./openrouter.service";
import {
  PERSONALITY_SYSTEM,
  buildPersonalityUserPrompt,
} from "./prompts/personality.prompts";
import { PersonalityInferenceResult } from "../../types";

/**
 * The CORE INNOVATION of Agent Arena.
 * Personality is inferred through natural conversation, not forms.
 * Called after every N chat messages (every 3 for MVP).
 */
export async function inferPersonality(
  agentId: string
): Promise<PersonalityInferenceResult> {
  // Get agent with recent chat messages
  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id: agentId },
    include: {
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  const currentTraits = {
    analytical: agent.traitAnalytical,
    creative: agent.traitCreative,
    aggressive: agent.traitAggressive,
    cautious: agent.traitCautious,
    social: agent.traitSocial,
    strategic: agent.traitStrategic,
  };

  // Call LLM to analyze personality from chat history
  const result = await callLLMJson<PersonalityInferenceResult>({
    messages: [
      { role: "system", content: PERSONALITY_SYSTEM },
      {
        role: "user",
        content: buildPersonalityUserPrompt(
          agent.chatMessages.reverse().map((m) => ({
            role: m.role,
            content: m.content,
          })),
          currentTraits
        ),
      },
    ],
    temperature: 0.3, // Low temperature for consistency
  });

  // Only update if confidence threshold is met
  if (result.confidence >= 0.3) {
    // Blend factor: never fully overwrite — old traits mix with new
    const blendFactor = Math.min(result.confidence, 0.7);

    const blend = (current: number | null, newVal: number): number =>
      current === null
        ? newVal
        : Math.round(current * (1 - blendFactor) + newVal * blendFactor);

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        traitAnalytical: blend(currentTraits.analytical, result.analytical),
        traitCreative: blend(currentTraits.creative, result.creative),
        traitAggressive: blend(currentTraits.aggressive, result.aggressive),
        traitCautious: blend(currentTraits.cautious, result.cautious),
        traitSocial: blend(currentTraits.social, result.social),
        traitStrategic: blend(currentTraits.strategic, result.strategic),
      },
    });

    // Store personality update as a memory
    await prisma.agentMemory.create({
      data: {
        agentId,
        type: "personality_update",
        content: result.reasoning,
        weight: 1.2,
        metadata: result as any,
      },
    });
  }

  return result;
}
