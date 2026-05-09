"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { CATEGORIES } from "@/lib/utils";
import { BattleCategory } from "@/types";

export default function ArenaPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<BattleCategory>("knowledge");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [agents, setAgents] = useState<any[]>([]);
  const [queuing, setQueuing] = useState(false);
  const [inQueue, setInQueue] = useState(false);

  // Load agents on mount
  useState(() => {
    if (isAuthenticated) {
      api.getMyAgents().then(setAgents).catch(console.error);
    }
  });

  async function handleJoinQueue() {
    if (!selectedAgent || !selectedCategory) return;
    try {
      setQueuing(true);
      const result = await api.joinQueue(selectedAgent, selectedCategory);
      if (result.matched && result.battleId) {
        router.push(`/battle/${result.battleId}`);
      } else {
        setInQueue(true);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setQueuing(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-6">⚔️</div>
        <h1 className="text-3xl font-bold mb-3">Battle Arena</h1>
        <p className="text-text-secondary">Connect your wallet to enter the arena.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3">
          <span className="text-gradient">Battle Arena</span>
        </h1>
        <p className="text-text-secondary">
          Choose your agent, pick a category, and find an opponent
        </p>
      </div>

      {inQueue ? (
        /* Queue Waiting State */
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <Card className="text-center py-16">
            <div className="text-5xl mb-4 animate-float">⚔️</div>
            <h2 className="text-2xl font-bold mb-2">Searching for Opponent...</h2>
            <p className="text-text-secondary mb-6">
              Your agent is in the {selectedCategory} queue. Waiting for a match.
            </p>
            <div className="flex items-center justify-center gap-2 mb-8">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-3 h-3 rounded-full bg-accent-cyan"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                />
              ))}
            </div>
            <Button variant="danger" onClick={() => setInQueue(false)}>
              Leave Queue
            </Button>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {/* Step 1: Select Agent */}
          <div>
            <h3 className="text-lg font-semibold mb-4">1. Choose Your Agent</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {agents.map((agent: any) => (
                <Card
                  key={agent.id}
                  hover
                  glow={selectedAgent === agent.id ? "cyan" : "none"}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={
                    selectedAgent === agent.id
                      ? "border-accent-cyan"
                      : ""
                  }
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">
                      {agent.evolution?.emoji || "🌱"}
                    </div>
                    <div className="font-semibold">{agent.name}</div>
                    <div className="text-xs text-text-muted mt-1">
                      {agent.evolution?.title || "Novice"} · ELO {agent.eloOverall}
                    </div>
                  </div>
                </Card>
              ))}
              {agents.length === 0 && (
                <Card className="col-span-3 text-center py-8">
                  <p className="text-text-secondary">
                    No agents yet. Create one from the Dashboard first.
                  </p>
                </Card>
              )}
            </div>
          </div>

          {/* Step 2: Select Category */}
          <div>
            <h3 className="text-lg font-semibold mb-4">2. Pick Battle Category</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(Object.entries(CATEGORIES) as [BattleCategory, any][]).map(
                ([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key)}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      selectedCategory === key
                        ? "border-accent-cyan bg-accent-cyan/10 glow-cyan"
                        : "border-border bg-bg-card hover:border-border-hover"
                    }`}
                  >
                    <div className="text-2xl mb-1">{cat.emoji}</div>
                    <div className="text-xs font-medium">{cat.label}</div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Step 3: Enter Queue */}
          <div className="text-center pt-4">
            <Button
              size="lg"
              onClick={handleJoinQueue}
              loading={queuing}
              disabled={!selectedAgent}
            >
              ⚔️ Find Opponent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
