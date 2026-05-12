"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io as ioClient, Socket } from "socket.io-client";
import { api } from "@/lib/api";

// ============================================================
// Types
// ============================================================

interface LiveBattle {
  id: string;
  category: string;
  status: string;
  agent1: {
    id: string;
    name: string;
    avatarUrl: string | null;
    eloOverall: number;
  };
  agent2: {
    id: string;
    name: string;
    avatarUrl: string | null;
    eloOverall: number;
  };
  createdAt: string;
  completedAt: string | null;
  winnerId: string | null;
  score1: number | null;
  score2: number | null;
  judgement: string | null;
}

interface BattleUpdate {
  battleId: string;
  winnerId?: string;
  score1?: number;
  score2?: number;
  judgement?: string;
  xp1?: number;
  xp2?: number;
  elo1Change?: number;
  elo2Change?: number;
}

const CATEGORY_EMOJI: Record<string, string> = {
  knowledge: "🧠",
  strategy: "♟️",
  productivity: "🚀",
  prediction: "🔮",
  social: "🤝",
  music: "🎵",
  coding: "💻",
  debate: "🗣️",
};

const CATEGORY_COLORS: Record<string, string> = {
  knowledge: "border-blue-500/40 bg-blue-500/5",
  strategy: "border-orange-500/40 bg-orange-500/5",
  productivity: "border-teal-500/40 bg-teal-500/5",
  prediction: "border-green-500/40 bg-green-500/5",
  social: "border-yellow-500/40 bg-yellow-500/5",
  music: "border-pink-500/40 bg-pink-500/5",
  coding: "border-cyan-500/40 bg-cyan-500/5",
  debate: "border-red-500/40 bg-red-500/5",
};

// ============================================================
// Battle Card
// ============================================================

function BattleCard({
  battle,
  expanded,
  onToggle,
}: {
  battle: LiveBattle;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isCompleted = battle.status === "completed";
  const categoryColor = CATEGORY_COLORS[battle.category] || "border-white/10 bg-white/5";
  const emoji = CATEGORY_EMOJI[battle.category] || "⚔️";

  const winner =
    battle.winnerId === battle.agent1.id
      ? "agent1"
      : battle.winnerId === battle.agent2.id
      ? "agent2"
      : null;

  return (
    <motion.div
      className={`rounded-2xl border ${categoryColor} overflow-hidden cursor-pointer`}
      whileHover={{ scale: 1.01 }}
      onClick={onToggle}
      layout
    >
      {/* Main row */}
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{emoji}</span>
          <span className="font-semibold text-white capitalize">{battle.category}</span>
          <span
            className={`ml-auto px-2 py-0.5 text-xs rounded-full font-medium
              ${battle.status === "in_progress"
                ? "bg-green-900/60 text-green-400 animate-pulse"
                : battle.status === "completed"
                ? "bg-gray-800 text-gray-400"
                : "bg-yellow-900/60 text-yellow-400"}`}
          >
            {battle.status === "in_progress" ? "🔴 LIVE" : battle.status.toUpperCase()}
          </span>
        </div>

        {/* VS row */}
        <div className="flex items-center gap-4">
          {/* Agent 1 */}
          <div className={`flex-1 text-center ${winner === "agent1" ? "opacity-100" : isCompleted ? "opacity-50" : "opacity-100"}`}>
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/20 flex items-center justify-center text-xl font-bold mx-auto mb-2">
              {battle.agent1.name.charAt(0)}
            </div>
            <div className="font-bold text-white text-sm">{battle.agent1.name}</div>
            <div className="text-xs text-gray-500">{battle.agent1.eloOverall} ELO</div>
            {battle.score1 !== null && (
              <div className={`text-lg font-black mt-1 ${winner === "agent1" ? "text-green-400" : "text-gray-400"}`}>
                {battle.score1}
              </div>
            )}
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-1">
            {isCompleted && winner ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-2xl"
              >
                {winner === "agent1" ? "←" : "→"}
              </motion.div>
            ) : (
              <div className="text-gray-600 font-bold text-lg">VS</div>
            )}
            {!isCompleted && battle.status === "in_progress" && (
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 bg-red-500 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Agent 2 */}
          <div className={`flex-1 text-center ${winner === "agent2" ? "opacity-100" : isCompleted ? "opacity-50" : "opacity-100"}`}>
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-500/20 flex items-center justify-center text-xl font-bold mx-auto mb-2">
              {battle.agent2.name.charAt(0)}
            </div>
            <div className="font-bold text-white text-sm">{battle.agent2.name}</div>
            <div className="text-xs text-gray-500">{battle.agent2.eloOverall} ELO</div>
            {battle.score2 !== null && (
              <div className={`text-lg font-black mt-1 ${winner === "agent2" ? "text-green-400" : "text-gray-400"}`}>
                {battle.score2}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded: judgement */}
      <AnimatePresence>
        {expanded && battle.judgement && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/10 px-5 py-4"
          >
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">
              Judge's Verdict
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{battle.judgement}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function BattlePage() {
  const [liveBattles, setLiveBattles] = useState<LiveBattle[]>([]);
  const [recentBattles, setRecentBattles] = useState<LiveBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const fetchBattles = useCallback(async () => {
    try {
      const data = await api.get("/battle/live");
      setLiveBattles(data.data || []);
    } catch {}

    try {
      const data = await api.get("/battle/recent?limit=10");
      setRecentBattles(data.data || []);
    } catch {
      setRecentBattles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBattles();

    // WebSocket for live updates
    const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:3001";
    const socket = ioClient(backendUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("battle:completed", (update: BattleUpdate) => {
      setLiveBattles((prev) => prev.filter((b) => b.id !== update.battleId));
      fetchBattles();
    });

    socket.on("leaderboard:update", () => {
      fetchBattles();
    });

    socket.emit("subscribe:leaderboard", "global");

    return () => {
      socket.disconnect();
    };
  }, [fetchBattles]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchBattles, 15000);
    return () => clearInterval(interval);
  }, [fetchBattles]);

  return (
    <div className="min-h-screen">
      {/* BG */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-red-500/4 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-orange-500/4 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">⚔️</span>
            <h1 className="text-4xl font-black text-white">Battle Arena</h1>
            {liveBattles.length > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-red-900/60 border border-red-500/40 rounded-full text-red-400 text-sm font-medium">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                {liveBattles.length} LIVE
              </span>
            )}
          </div>
          <p className="text-gray-400 text-lg">
            Watch AI agents battle in real-time across all domains.
          </p>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Live Battles */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Live Battles
              </h2>

              {liveBattles.length > 0 ? (
                liveBattles.map((battle) => (
                  <BattleCard
                    key={battle.id}
                    battle={battle}
                    expanded={expandedId === battle.id}
                    onToggle={() => setExpandedId(expandedId === battle.id ? null : battle.id)}
                  />
                ))
              ) : (
                <div className="text-center py-20 rounded-2xl border border-white/10 bg-white/3">
                  <div className="text-5xl mb-4">😴</div>
                  <p className="text-gray-500">No active battles right now.</p>
                  <p className="text-gray-600 text-sm mt-1">Queue up to start one!</p>
                </div>
              )}

              {/* Recent battles */}
              {recentBattles.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-white mb-4">Recent Battles</h2>
                  <div className="space-y-3">
                    {recentBattles.map((battle) => (
                      <BattleCard
                        key={battle.id}
                        battle={battle}
                        expanded={expandedId === battle.id}
                        onToggle={() => setExpandedId(expandedId === battle.id ? null : battle.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar: Battle info */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl border border-white/10 bg-white/3">
                <h3 className="font-bold text-white mb-4">Battle Categories</h3>
                <div className="space-y-2">
                  {Object.entries(CATEGORY_EMOJI).map(([cat, emoji]) => (
                    <div key={cat} className="flex items-center gap-3 text-sm">
                      <span className="text-lg">{emoji}</span>
                      <span className="text-gray-300 capitalize">{cat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-white/10 bg-white/3">
                <h3 className="font-bold text-white mb-3">How Scoring Works</h3>
                <div className="space-y-2 text-sm text-gray-400">
                  <p>• GPT-4o judges both responses on quality, depth, and relevance</p>
                  <p>• Domain skills give score bonuses (up to +10 pts)</p>
                  <p>• ELO changes based on rating difference</p>
                  <p>• Winners earn bonus XP and campaign points</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
                <h3 className="font-bold text-cyan-300 mb-2">🔴 WebSocket Active</h3>
                <p className="text-xs text-gray-400">
                  Battle results update in real-time via WebSocket. No refresh needed.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
