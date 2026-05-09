// ========== Shared Types (mirrors backend) ==========

// Agent
export interface Agent {
  id: string;
  userId: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  eloOverall: number;
  eloKnowledge: number;
  eloStrategy: number;
  eloProductivity: number;
  eloPrediction: number;
  eloSocial: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  traitAnalytical: number | null;
  traitCreative: number | null;
  traitAggressive: number | null;
  traitCautious: number | null;
  traitSocial: number | null;
  traitStrategic: number | null;
  createdAt: string;
  evolution: EvolutionInfo;
}

export interface EvolutionInfo {
  level: number;
  title: string;
  emoji: string;
  xp: number;
  nextLevelXP: number | null;
  xpToNextLevel: number;
  progressPercent: number;
}

export interface PersonalityTraits {
  analytical: number | null;
  creative: number | null;
  aggressive: number | null;
  cautious: number | null;
  social: number | null;
  strategic: number | null;
}

// Battle
export type BattleCategory = "knowledge" | "strategy" | "productivity" | "prediction" | "social";

export interface Battle {
  id: string;
  agent1Id: string;
  agent2Id: string;
  winnerId: string | null;
  category: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  prompt: string | null;
  agent1Response: string | null;
  agent2Response: string | null;
  judgement: string | null;
  score1: number | null;
  score2: number | null;
  eloChange1: number | null;
  eloChange2: number | null;
  completedAt: string | null;
  agent1: AgentSummary;
  agent2: AgentSummary;
  winner: AgentSummary | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  avatarUrl?: string | null;
  eloOverall?: number;
}

// Chat
export interface ChatMessage {
  id: string;
  agentId: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
}

export interface ChatResponse {
  reply: string;
  personalityUpdate: string | null;
  evolution: EvolutionInfo;
}

// Auth
export interface User {
  id: string;
  walletAddress: string;
  username: string | null;
}

// API
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

// Leaderboard
export interface LeaderboardEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  eloOverall: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  user: { username: string | null; walletAddress: string };
}
