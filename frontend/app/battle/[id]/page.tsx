"use client";

import { useState, useEffect, use } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Battle } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";

export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBattle();
    // Poll for updates if battle is in progress
    const interval = setInterval(async () => {
      try {
        const data = await api.getBattle(id);
        setBattle(data);
        if (data.status === "completed" || data.status === "cancelled") {
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  async function loadBattle() {
    try {
      const data = await api.getBattle(id);
      setBattle(data);
    } catch (err) {
      console.error("Failed to load battle:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-12 w-64 mx-auto" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!battle) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-3">❌</div>
        <p className="text-text-secondary">Battle not found</p>
      </div>
    );
  }

  const isCompleted = battle.status === "completed";
  const isInProgress = battle.status === "in_progress" || battle.status === "pending";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <Badge variant={isCompleted ? "green" : isInProgress ? "cyan" : "gray"} size="md">
          {battle.status === "in_progress"
            ? "⚡ Battle in Progress"
            : battle.status === "completed"
            ? "✅ Completed"
            : battle.status === "pending"
            ? "⏳ Starting..."
            : "❌ Cancelled"}
        </Badge>
        <h1 className="text-3xl font-bold mt-4">
          {battle.agent1.name} <span className="text-text-muted">vs</span>{" "}
          {battle.agent2.name}
        </h1>
        {battle.category && (
          <p className="text-text-secondary mt-1 capitalize">
            {battle.category} Battle
          </p>
        )}
      </div>

      {/* Challenge Prompt */}
      {battle.prompt && (
        <Card className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Challenge
          </div>
          <p className="text-text-primary">{battle.prompt}</p>
        </Card>
      )}

      {/* Agent Responses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Agent 1 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card
            glow={
              isCompleted && battle.winnerId === battle.agent1.id
                ? "gold"
                : "none"
            }
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center text-sm font-bold">
                  {battle.agent1.name.charAt(0)}
                </div>
                <span className="font-semibold">{battle.agent1.name}</span>
              </div>
              {isCompleted && battle.winnerId === battle.agent1.id && (
                <Badge variant="gold">🏆 Winner</Badge>
              )}
              {isCompleted && battle.score1 !== null && (
                <span className="text-2xl font-bold text-accent-cyan">
                  {battle.score1}
                </span>
              )}
            </div>
            {battle.agent1Response ? (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {battle.agent1Response}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <motion.div
                  className="w-2 h-2 rounded-full bg-accent-cyan"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                Thinking...
              </div>
            )}
          </Card>
        </motion.div>

        {/* Agent 2 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card
            glow={
              isCompleted && battle.winnerId === battle.agent2.id
                ? "gold"
                : "none"
            }
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center text-sm font-bold">
                  {battle.agent2.name.charAt(0)}
                </div>
                <span className="font-semibold">{battle.agent2.name}</span>
              </div>
              {isCompleted && battle.winnerId === battle.agent2.id && (
                <Badge variant="gold">🏆 Winner</Badge>
              )}
              {isCompleted && battle.score2 !== null && (
                <span className="text-2xl font-bold text-accent-purple">
                  {battle.score2}
                </span>
              )}
            </div>
            {battle.agent2Response ? (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {battle.agent2Response}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <motion.div
                  className="w-2 h-2 rounded-full bg-accent-purple"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                Thinking...
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Judge Verdict */}
      {isCompleted && battle.judgement && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card glow="purple">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
              ⚖️ Judge&apos;s Verdict
            </div>
            <p className="text-text-primary">{battle.judgement}</p>
            {battle.eloChange1 !== null && (
              <div className="flex gap-4 mt-4 text-sm">
                <span className="text-text-secondary">
                  {battle.agent1.name}:{" "}
                  <span
                    className={
                      (battle.eloChange1 ?? 0) >= 0
                        ? "text-green-400"
                        : "text-accent-pink"
                    }
                  >
                    {(battle.eloChange1 ?? 0) >= 0 ? "+" : ""}
                    {battle.eloChange1} ELO
                  </span>
                </span>
                <span className="text-text-secondary">
                  {battle.agent2.name}:{" "}
                  <span
                    className={
                      (battle.eloChange2 ?? 0) >= 0
                        ? "text-green-400"
                        : "text-accent-pink"
                    }
                  >
                    {(battle.eloChange2 ?? 0) >= 0 ? "+" : ""}
                    {battle.eloChange2} ELO
                  </span>
                </span>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
