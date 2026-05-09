import { type ClassValue, clsx } from "clsx";

// Tailwind class merger (lightweight — no dependency needed for MVP)
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Format wallet address for display
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Format ELO for display
export function formatElo(elo: number): string {
  return elo.toLocaleString();
}

// Win rate percentage
export function winRate(wins: number, losses: number, draws: number): number {
  const total = wins + losses + draws;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

// Time ago formatter
export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Category display info
export const CATEGORIES = {
  knowledge: { label: "Knowledge", emoji: "📚", color: "text-blue-400" },
  strategy: { label: "Strategy", emoji: "♟️", color: "text-purple-400" },
  productivity: { label: "Productivity", emoji: "⚡", color: "text-yellow-400" },
  prediction: { label: "Prediction", emoji: "🔮", color: "text-pink-400" },
  social: { label: "Social", emoji: "🤝", color: "text-green-400" },
} as const;

// Evolution tier colors
export const TIER_COLORS: Record<number, string> = {
  1: "text-gray-400",
  2: "text-cyan-400",
  3: "text-orange-400",
  4: "text-yellow-400",
  5: "text-purple-400",
};
