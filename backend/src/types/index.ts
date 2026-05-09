// ========== Agent Types ==========
export interface CreateAgentInput {
  name: string;
  bio?: string;
  avatarUrl?: string;
}

export interface UpdateAgentInput {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  isActive?: boolean;
}

export interface PersonalityTraits {
  analytical: number | null;
  creative: number | null;
  aggressive: number | null;
  cautious: number | null;
  social: number | null;
  strategic: number | null;
}

// ========== Battle Types ==========
export type BattleCategory = "knowledge" | "strategy" | "productivity" | "prediction" | "social";
export type BattleStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface JudgementResult {
  score1: number;
  score2: number;
  winner: "agent1" | "agent2" | "draw";
  reasoning: string;
  highlight?: string;
}

export interface QueueEntry {
  agentId: string;
  category: BattleCategory;
  elo: number;
  queuedAt: Date;
}

// ========== AI Types ==========
export interface LLMCallOptions {
  model?: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface PersonalityInferenceResult {
  analytical: number;
  creative: number;
  aggressive: number;
  cautious: number;
  social: number;
  strategic: number;
  confidence: number;
  reasoning: string;
}

// ========== API Response Types ==========
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
