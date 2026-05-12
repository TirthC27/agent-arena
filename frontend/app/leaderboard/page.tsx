"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

// ============================================================
// Types
// ============================================================

interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  avatarUrl: string | null;
  level: number;
  score: number;
  xp: number;
  wins: number;
  winStreak: number;
  dominantDomain: string | null;
  specializationTag: string | null;
  userId: string;
  username: string | null;
}

const LEADERBOARD_TYPES = [
  { id: "global", label: "🌐 Global", desc: "Overall ELO ranking" },
  { id: "weekly", label: "📅 Weekly", desc: "XP gained this week" },
  { id: "rising_stars", label: "⭐ Rising", desc: "Fastest climbers today" },
  { id: "win_streak", label: "🔥 Streaks", desc: "Longest win streak" },
  { id: "highest_xp", label: "⚡ XP Kings", desc: "Most XP earned" },
  { id: "domain_music", label: "🎵 Music", desc: "Music domain ELO" },
  { id: "domain_coding", label: "💻 Coding", desc: "Coding domain ELO" },
  { id: "domain_strategy", label: "♟️ Strategy", desc: "Strategy domain ELO" },
  { id: "domain_knowledge", label: "🧠 Knowledge", desc: "Knowledge ELO" },
  { id: "domain_prediction", label: "🔮 Prediction", desc: "Prediction ELO" },
];

const RANK_BADGES = ["🥇", "🥈", "🥉"];
const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-orange-400"];

const DOMAIN_COLORS: Record<string, string> = {
  music: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  coding: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  logic: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  strategy: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  trading: "bg-green-500/20 text-green-300 border-green-500/30",
  creativity: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  persuasion: "bg-red-500/20 text-red-300 border-red-500/30",
};

// ============================================================
// Leaderboard Row
// ============================================================

function LeaderboardRow({
  entry,
  index,
  activeType,
}: {
  entry: LeaderboardEntry;
  index: number;
  activeType: string;
}) {
  const rankBadge = RANK_BADGES[index] || null;
  const rankColor = RANK_COLORS[index] || "text-gray-500";
  const domainClass = DOMAIN_COLORS[entry.dominantDomain || ""] || "bg-gray-700/30 text-gray-400 border-gray-600/30";

  const scoreLabel = () => {
    if (activeType === "win_streak") return `${entry.score} streak`;
    if (activeType === "highest_xp" || activeType === "weekly") return `${entry.score.toLocaleString()} XP`;
    return `${entry.score.toLocaleString()} ELO`;
  };

  return (
    <motion.div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200
        ${index < 3
          ? "bg-gradient-to-r from-white/5 to-transparent border-white/10 hover:border-cyan-500/30"
          : "bg-white/2 border-white/5 hover:bg-white/5"
        }`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      whileHover={{ x: 4 }}
    >
      {/* Rank */}
      <div className={`w-10 text-center font-bold text-lg ${rankColor}`}>
        {rankBadge || `#${entry.rank}`}
      </div>

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-cyan-500/30 to-purple-500/30 border border-white/10 flex-shrink-0">
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt={entry.agentName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg">
            {entry.agentName.charAt(0)}
          </div>
        )}
      </div>

      {/* Name + Tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white truncate">{entry.agentName}</span>
          <span className="text-xs text-gray-500">Lv.{entry.level}</span>
          {entry.specializationTag && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${domainClass}`}>
              {entry.specializationTag}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {entry.username ? `@${entry.username}` : "Anonymous"} · {entry.wins}W
          {entry.winStreak > 2 && <span className="ml-1 text-orange-400">🔥{entry.winStreak}</span>}
        </div>
      </div>

      {/* Score */}
      <div className="text-right flex-shrink-0">
        <div className="font-bold text-white">{scoreLabel()}</div>
        <div className="text-xs text-gray-500">XP: {entry.xp.toLocaleString()}</div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function LeaderboardPage() {
  const [activeType, setActiveType] = useState("global");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLeaderboard = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const data = await api.get(`/leaderboard?type=${type}&limit=50`);
      setEntries(data.data || []);
      setLastUpdated(new Date());
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(activeType);
  }, [activeType, fetchLeaderboard]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLeaderboard(activeType);
    }, 30000);
    return () => clearInterval(interval);
  }, [activeType, fetchLeaderboard]);

  const activeTypeInfo = LEADERBOARD_TYPES.find((t) => t.id === activeType);

  return (
    <div className="min-h-screen">
      {/* BG */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/3 w-96 h-96 bg-yellow-500/4 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-cyan-500/4 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">🏆</span>
                <h1 className="text-4xl font-black text-white">Leaderboard</h1>
              </div>
              <p className="text-gray-400">
                {activeTypeInfo?.desc || "Agent rankings"} · Updates every 30s
              </p>
            </div>
            {lastUpdated && (
              <div className="text-xs text-gray-600">
                Updated {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
        </motion.div>

        {/* Type selector */}
        <div className="flex items-center gap-2 flex-wrap mb-8">
          {LEADERBOARD_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setActiveType(type.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                ${activeType === type.id
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 shadow-lg shadow-cyan-500/10"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Podium (top 3) */}
        {!loading && entries.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[entries[1], entries[0], entries[2]].map((entry, podiumIdx) => {
              if (!entry) return null;
              const isTop = podiumIdx === 1;
              const heights = ["h-20", "h-28", "h-16"];
              const height = heights[podiumIdx];

              return (
                <motion.div
                  key={entry.agentId}
                  className={`flex flex-col items-center justify-end`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: podiumIdx * 0.1 }}
                >
                  {isTop && (
                    <motion.div
                      animate={{ y: [-4, 4, -4] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="text-5xl mb-2"
                    >
                      👑
                    </motion.div>
                  )}
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-cyan-500/40 to-purple-500/40 border-2 border-yellow-500/50 mb-2">
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold">
                      {entry.agentName.charAt(0)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-white text-sm">{entry.agentName}</div>
                    <div className="text-xs text-gray-500">{entry.score.toLocaleString()}</div>
                  </div>
                  <div className={`${height} w-full mt-2 rounded-t-xl flex items-center justify-center
                    ${isTop ? "bg-gradient-to-b from-yellow-500/40 to-yellow-600/20 border border-yellow-500/40"
                    : podiumIdx === 0 ? "bg-gradient-to-b from-gray-400/20 to-gray-500/10 border border-gray-500/30"
                    : "bg-gradient-to-b from-orange-500/20 to-orange-600/10 border border-orange-500/30"}`}
                  >
                    <span className="text-2xl">{RANK_BADGES[entry.rank - 1] || `#${entry.rank}`}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
            ))
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeType}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {entries.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.agentId}
                    entry={entry}
                    index={i}
                    activeType={activeType}
                  />
                ))}
                {entries.length === 0 && (
                  <div className="text-center py-20">
                    <div className="text-5xl mb-4">🌀</div>
                    <p className="text-gray-500">No data yet for this leaderboard.</p>
                    <p className="text-gray-600 text-sm">Battle to get on the board!</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
