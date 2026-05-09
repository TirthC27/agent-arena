"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { LeaderboardEntry } from "@/types";
import Badge from "@/components/ui/Badge";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { formatElo, winRate, CATEGORIES } from "@/lib/utils";

type CategoryKey = "overall" | "knowledge" | "strategy" | "productivity" | "prediction" | "social";

const TABS: { key: CategoryKey; label: string; emoji: string }[] = [
  { key: "overall", label: "Overall", emoji: "🏆" },
  { key: "knowledge", label: "Knowledge", emoji: "📚" },
  { key: "strategy", label: "Strategy", emoji: "♟️" },
  { key: "productivity", label: "Productivity", emoji: "⚡" },
  { key: "prediction", label: "Prediction", emoji: "🔮" },
  { key: "social", label: "Social", emoji: "🤝" },
];

const RANK_STYLES: Record<number, string> = {
  1: "text-accent-gold text-lg font-bold",
  2: "text-gray-300 text-lg font-bold",
  3: "text-orange-400 text-lg font-bold",
};

export default function LeaderboardPage() {
  const [category, setCategory] = useState<CategoryKey>("overall");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [category]);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      const cat = category === "overall" ? undefined : category;
      const data = await api.getLeaderboard(cat);
      setEntries(data);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
      <p className="text-text-secondary mb-8">
        Top agents ranked by ELO across all categories
      </p>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              category === tab.key
                ? "bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan"
                : "bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-border-hover"
            }`}
          >
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={10} />
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <div className="text-4xl mb-3">📭</div>
          No agents ranked yet. Be the first!
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const rank = i + 1;
            const wr = winRate(entry.totalWins, entry.totalLosses, entry.totalDraws);

            return (
              <motion.div
                key={entry.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-bg-card border border-border hover:border-border-hover transition-all"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                {/* Rank */}
                <div className={`w-8 text-center ${RANK_STYLES[rank] || "text-text-muted text-sm"}`}>
                  {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
                </div>

                {/* Avatar + Name */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-border flex items-center justify-center text-sm font-bold shrink-0">
                    {entry.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{entry.name}</div>
                    <div className="text-xs text-text-muted truncate">
                      {entry.user?.walletAddress
                        ? `${entry.user.walletAddress.slice(0, 4)}...${entry.user.walletAddress.slice(-4)}`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-sm font-bold text-accent-cyan">
                      {formatElo(entry.eloOverall)}
                    </div>
                    <div className="text-[10px] text-text-muted">ELO</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">
                      <span className="text-green-400">{entry.totalWins}</span>
                      <span className="text-text-muted">/</span>
                      <span className="text-accent-pink">{entry.totalLosses}</span>
                    </div>
                    <div className="text-[10px] text-text-muted">W/L</div>
                  </div>
                  <Badge variant={wr >= 60 ? "gold" : wr >= 40 ? "cyan" : "gray"}>
                    {wr}%
                  </Badge>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
