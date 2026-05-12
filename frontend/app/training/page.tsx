"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

// ============================================================
// Types
// ============================================================

interface TrainingResult {
  trainingSessionId: string;
  domain: string;
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  result: string;
  skillGain: {
    domain: string;
    xpGained: number;
    newLevel: number;
    levelUp: boolean;
    newXP: number;
  };
}

const DOMAINS = [
  { id: "logic", label: "Logic", emoji: "🧩", desc: "Deductive reasoning & puzzles", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
  { id: "coding", label: "Coding", emoji: "💻", desc: "Algorithms & technical design", color: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30" },
  { id: "music", label: "Music", emoji: "🎵", desc: "Theory, history & composition", color: "from-pink-500/20 to-pink-600/10 border-pink-500/30" },
  { id: "trading", label: "Trading", emoji: "📈", desc: "Market analysis & strategy", color: "from-green-500/20 to-green-600/10 border-green-500/30" },
  { id: "creativity", label: "Creativity", emoji: "🎨", desc: "Creative challenges & ideation", color: "from-purple-500/20 to-purple-600/10 border-purple-500/30" },
  { id: "persuasion", label: "Persuasion", emoji: "🗣️", desc: "Rhetoric & argumentation", color: "from-red-500/20 to-red-600/10 border-red-500/30" },
  { id: "memory", label: "Memory", emoji: "🧠", desc: "Knowledge recall & synthesis", color: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30" },
  { id: "speed", label: "Speed", emoji: "⚡", desc: "Rapid thinking & quick answers", color: "from-orange-500/20 to-orange-600/10 border-orange-500/30" },
  { id: "strategy", label: "Strategy", emoji: "♟️", desc: "Long-term planning & tactics", color: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30" },
];

// ============================================================
// Domain Card
// ============================================================

function DomainCard({
  domain,
  selected,
  onSelect,
}: {
  domain: typeof DOMAINS[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.div
      onClick={onSelect}
      className={`relative p-5 rounded-2xl border cursor-pointer transition-all duration-200
        bg-gradient-to-br ${domain.color}
        ${selected ? "ring-2 ring-cyan-500/80 scale-[1.02]" : "hover:scale-[1.01]"}`}
      whileTap={{ scale: 0.98 }}
    >
      <div className="text-4xl mb-3">{domain.emoji}</div>
      <h3 className="font-bold text-white text-lg mb-1">{domain.label}</h3>
      <p className="text-xs text-gray-400">{domain.desc}</p>
      {selected && (
        <motion.div
          layoutId="selection-ring"
          className="absolute inset-0 rounded-2xl border-2 border-cyan-400/80 pointer-events-none"
          initial={false}
        />
      )}
    </motion.div>
  );
}

// ============================================================
// Training Result Card
// ============================================================

function TrainingResultCard({ result }: { result: TrainingResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border border-emerald-500/30"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">
          {DOMAINS.find((d) => d.id === result.domain)?.emoji || "⚡"}
        </span>
        <div>
          <div className="font-bold text-white text-lg">
            Training Complete: {result.domain.toUpperCase()}
          </div>
          {result.levelUp && (
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: 3 }}
              className="text-sm text-yellow-400 font-semibold"
            >
              🎉 LEVEL UP! Now Level {result.newLevel}
            </motion.div>
          )}
        </div>
        <div className="ml-auto text-right">
          <div className="text-2xl font-black text-emerald-400">+{result.xpGained} XP</div>
          <div className="text-xs text-gray-500">Skill XP gained</div>
        </div>
      </div>

      {/* Response */}
      <div className="p-4 bg-black/30 rounded-xl border border-white/10">
        <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">
          Agent's Training Response
        </div>
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          {result.result}
        </p>
      </div>
    </motion.div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function TrainingCenterPage() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [agentId] = useState("mock-agent-id"); // TODO: get from user context
  const [training, setTraining] = useState(false);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTrain = useCallback(async () => {
    if (!selectedDomain) return;
    setTraining(true);
    setResult(null);
    setError(null);

    try {
      const data = await api.post("/training/train", {
        agentId,
        domain: selectedDomain,
      });
      setResult(data.data);
    } catch (err: any) {
      setError(err.message || "Training failed. Please try again.");
    } finally {
      setTraining(false);
    }
  }, [selectedDomain, agentId]);

  return (
    <div className="min-h-screen">
      {/* BG */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">🧠</span>
            <h1 className="text-4xl font-black text-white">Training Center</h1>
          </div>
          <p className="text-gray-400 text-lg">
            Train your agent across 9 skill domains. Each session earns XP and evolves your agent's personality.
          </p>
        </motion.div>

        {/* Domain grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 mb-8">
          {DOMAINS.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              selected={selectedDomain === domain.id}
              onSelect={() => {
                setSelectedDomain(domain.id);
                setResult(null);
                setError(null);
              }}
            />
          ))}
        </div>

        {/* Train button */}
        <AnimatePresence>
          {selectedDomain && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center justify-center"
            >
              <button
                onClick={handleTrain}
                disabled={training}
                className={`px-10 py-4 rounded-2xl text-lg font-bold transition-all duration-300
                  ${training
                    ? "bg-gray-700 text-gray-400 cursor-wait"
                    : "bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:shadow-lg hover:shadow-cyan-500/25 hover:scale-105 active:scale-95"
                  }`}
              >
                {training ? (
                  <span className="flex items-center gap-3">
                    <span className="w-5 h-5 border-2 border-gray-400/50 border-t-gray-300 rounded-full animate-spin" />
                    Training {DOMAINS.find((d) => d.id === selectedDomain)?.label}...
                  </span>
                ) : (
                  `🚀 Train ${DOMAINS.find((d) => d.id === selectedDomain)?.label} Skill`
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Training animation */}
        <AnimatePresence>
          {training && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/10 text-center"
            >
              <div className="flex justify-center mb-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="text-5xl"
                >
                  {DOMAINS.find((d) => d.id === selectedDomain)?.emoji || "⚡"}
                </motion.div>
              </div>
              <p className="text-gray-300 font-semibold mb-1">
                Agent is working through the challenge...
              </p>
              <p className="text-sm text-gray-500">Using AI to generate a unique training response</p>
              <div className="mt-4 flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-cyan-500 rounded-full"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 p-4 rounded-xl bg-red-900/30 border border-red-500/30 text-red-400"
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && <TrainingResultCard result={result} />}
        </AnimatePresence>

        {/* Info callout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 p-5 rounded-xl bg-white/3 border border-white/8"
        >
          <h3 className="font-semibold text-white mb-3">How Training Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-400">
            <div className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">01</span>
              <span>Your agent receives a domain-specific challenge from the system</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">02</span>
              <span>GPT-4o generates a unique response using your agent's personality</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-400 mt-0.5">03</span>
              <span>XP and skill levels increase. Personality evolves based on training history.</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
