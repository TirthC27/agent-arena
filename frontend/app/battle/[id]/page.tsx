"use client";

import { useState, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { Battle } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Typewriter from "@/components/ui/Typewriter";
import ScoreCounter from "@/components/ui/ScoreCounter";
import Confetti from "@/components/ui/Confetti";

type BattlePhase =
  | "loading"
  | "prompt"
  | "thinking"
  | "responding"
  | "judging"
  | "verdict"
  | "complete";

export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [phase, setPhase] = useState<BattlePhase>("loading");
  const [showConfetti, setShowConfetti] = useState(false);
  const [agent1Done, setAgent1Done] = useState(false);
  const [agent2Done, setAgent2Done] = useState(false);

  // Load battle and subscribe to SSE updates, falling back to polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    async function init() {
      try {
        const data = await api.getBattle(id);
        setBattle(data);
        derivePhase(data);

        // If not yet finished, subscribe to live updates
        if (data.status !== "completed" && data.status !== "cancelled") {
          try {
            unsubscribe = api.subscribeToBattle(id, (update) => {
              setBattle((prev) => {
                if (!prev) return prev;
                const merged = { ...prev, ...update } as Battle;
                derivePhase(merged);
                return merged;
              });
            });
          } catch {
            // SSE failed — fall back to polling
            interval = setInterval(async () => {
              try {
                const data = await api.getBattle(id);
                setBattle(data);
                derivePhase(data);
                if (data.status === "completed" || data.status === "cancelled") {
                  if (interval) clearInterval(interval);
                }
              } catch { /* ignore */ }
            }, 2000);
          }
        }
      } catch (err) {
        console.error("Failed to load battle:", err);
      }
    }

    init();
    return () => {
      if (interval) clearInterval(interval);
      if (unsubscribe) unsubscribe();
    };
  }, [id]);

  // Derive UI phase from actual battle data — not timers
  function derivePhase(b: Battle) {
    if (b.status === "cancelled") {
      setPhase("complete");
      return;
    }
    if (b.status === "completed" && b.judgement) {
      // Completed battle — run a brief dramatic reveal driven by data presence
      if (phase === "loading" || phase === "prompt") {
        setPhase("responding");
        setTimeout(() => setPhase("judging"), 1500);
        setTimeout(() => setPhase("verdict"), 3000);
        setTimeout(() => {
          setPhase("complete");
          setShowConfetti(true);
        }, 4500);
      }
      return;
    }
    if (b.agent1Response && b.agent2Response && !b.judgement) {
      setPhase("judging");
      return;
    }
    if (b.agent1Response || b.agent2Response) {
      setPhase("responding");
      return;
    }
    if (b.status === "in_progress") {
      setPhase("thinking");
      return;
    }
    setPhase("prompt");
  }

  // Both typewriters done → if battle is completed, advance to judging
  useEffect(() => {
    if (agent1Done && agent2Done && phase === "responding" && battle?.judgement) {
      setTimeout(() => setPhase("judging"), 800);
      setTimeout(() => setPhase("verdict"), 2500);
      setTimeout(() => {
        setPhase("complete");
        setShowConfetti(true);
      }, 4000);
    }
  }, [agent1Done, agent2Done, phase, battle?.judgement]);

  if (!battle) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-12 w-64 mx-auto" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const isWinner = (agentId: string) =>
    phase === "complete" && battle.winnerId === agentId;
  const isLoser = (agentId: string) =>
    phase === "complete" && battle.winnerId !== null && battle.winnerId !== agentId;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      <Confetti trigger={showConfetti} />

      {/* Header */}
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Badge
          variant={
            phase === "complete"
              ? "gold"
              : phase === "judging"
              ? "purple"
              : "cyan"
          }
          size="md"
        >
          {phase === "loading" && "Loading..."}
          {phase === "prompt" && "📋 Challenge Issued"}
          {phase === "thinking" && "🧠 Agents Thinking..."}
          {phase === "responding" && "✍️ Agents Responding..."}
          {phase === "judging" && "⚖️ Judge Deliberating..."}
          {phase === "verdict" && "📊 Scores Revealed"}
          {phase === "complete" && "🏆 Battle Complete"}
        </Badge>

        <h1 className="text-3xl font-bold mt-4">
          <span className={isWinner(battle.agent1.id) ? "text-accent-gold" : ""}>
            {battle.agent1.name}
          </span>
          <motion.span
            className="mx-4 text-text-muted"
            animate={
              phase === "prompt"
                ? { scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }
                : {}
            }
            transition={{ duration: 1.5, repeat: phase === "prompt" ? Infinity : 0 }}
          >
            VS
          </motion.span>
          <span className={isWinner(battle.agent2.id) ? "text-accent-gold" : ""}>
            {battle.agent2.name}
          </span>
        </h1>

        {battle.category && (
          <p className="text-text-secondary mt-1 capitalize">
            {battle.category} Battle
          </p>
        )}
      </motion.div>

      {/* Challenge Prompt */}
      <AnimatePresence>
        {battle.prompt && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card>
              <div className="text-xs text-accent-cyan uppercase tracking-wider mb-2 font-semibold">
                ⚡ Challenge
              </div>
              <p className="text-text-primary text-lg">{battle.prompt}</p>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Responses — Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Agent 1 */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div
            className={`rounded-2xl border p-5 transition-all duration-500 ${
              isWinner(battle.agent1.id)
                ? "border-accent-gold bg-accent-gold/5 glow-gold"
                : isLoser(battle.agent1.id)
                ? "border-border bg-bg-card opacity-70"
                : "border-border bg-bg-card"
            }`}
          >
            {/* Agent Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-cyan/5 border border-accent-cyan/20 flex items-center justify-center font-bold">
                  {battle.agent1.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold">{battle.agent1.name}</div>
                  <div className="text-xs text-text-muted">
                    ELO {battle.agent1.eloOverall || "—"}
                  </div>
                </div>
              </div>
              {isWinner(battle.agent1.id) && (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <Badge variant="gold">🏆 Winner</Badge>
                </motion.div>
              )}
              {phase === "verdict" || phase === "complete"
                ? battle.score1 !== null && (
                    <div className="text-3xl">
                      <ScoreCounter target={battle.score1} delay={300} />
                    </div>
                  )
                : null}
            </div>

            {/* Response Body */}
            <div className="min-h-[120px]">
              {!battle.agent1Response &&
                (phase === "thinking" || phase === "prompt") && (
                  <div className="flex items-center gap-2 text-text-muted text-sm py-8 justify-center">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-accent-cyan"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-accent-cyan"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-accent-cyan"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    />
                    <span className="ml-2">Thinking...</span>
                  </div>
                )}
              {battle.agent1Response && phase !== "prompt" && (
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                  <Typewriter
                    text={battle.agent1Response}
                    speed={20}
                    delay={500}
                    onComplete={() => setAgent1Done(true)}
                  />
                </p>
              )}
            </div>

            {/* ELO Change */}
            <AnimatePresence>
              {phase === "complete" && battle.eloChange1 !== null && (
                <motion.div
                  className="mt-4 pt-3 border-t border-border text-sm text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <span
                    className={
                      (battle.eloChange1 ?? 0) >= 0
                        ? "text-green-400 font-semibold"
                        : "text-accent-pink"
                    }
                  >
                    {(battle.eloChange1 ?? 0) >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(battle.eloChange1 ?? 0)} ELO
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Agent 2 */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div
            className={`rounded-2xl border p-5 transition-all duration-500 ${
              isWinner(battle.agent2.id)
                ? "border-accent-gold bg-accent-gold/5 glow-gold"
                : isLoser(battle.agent2.id)
                ? "border-border bg-bg-card opacity-70"
                : "border-border bg-bg-card"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-purple/5 border border-accent-purple/20 flex items-center justify-center font-bold">
                  {battle.agent2.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold">{battle.agent2.name}</div>
                  <div className="text-xs text-text-muted">
                    ELO {battle.agent2.eloOverall || "—"}
                  </div>
                </div>
              </div>
              {isWinner(battle.agent2.id) && (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <Badge variant="gold">🏆 Winner</Badge>
                </motion.div>
              )}
              {phase === "verdict" || phase === "complete"
                ? battle.score2 !== null && (
                    <div className="text-3xl">
                      <ScoreCounter target={battle.score2} delay={600} />
                    </div>
                  )
                : null}
            </div>

            <div className="min-h-[120px]">
              {!battle.agent2Response &&
                (phase === "thinking" || phase === "prompt") && (
                  <div className="flex items-center gap-2 text-text-muted text-sm py-8 justify-center">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-accent-purple"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-accent-purple"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-accent-purple"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    />
                    <span className="ml-2">Thinking...</span>
                  </div>
                )}
              {battle.agent2Response && phase !== "prompt" && (
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                  <Typewriter
                    text={battle.agent2Response}
                    speed={20}
                    delay={1000}
                    onComplete={() => setAgent2Done(true)}
                  />
                </p>
              )}
            </div>

            <AnimatePresence>
              {phase === "complete" && battle.eloChange2 !== null && (
                <motion.div
                  className="mt-4 pt-3 border-t border-border text-sm text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <span
                    className={
                      (battle.eloChange2 ?? 0) >= 0
                        ? "text-green-400 font-semibold"
                        : "text-accent-pink"
                    }
                  >
                    {(battle.eloChange2 ?? 0) >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(battle.eloChange2 ?? 0)} ELO
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Judging Overlay */}
      <AnimatePresence>
        {phase === "judging" && (
          <motion.div
            className="text-center py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-5xl mb-4"
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ⚖️
            </motion.div>
            <p className="text-lg text-text-secondary">
              The Grand Arbiter is deliberating...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Judge Verdict */}
      <AnimatePresence>
        {(phase === "verdict" || phase === "complete") && battle.judgement && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 150 }}
          >
            <Card glow="purple" className="text-center">
              <div className="text-xs text-accent-purple uppercase tracking-wider mb-3 font-semibold">
                ⚖️ Judge&apos;s Verdict
              </div>
              <p className="text-text-primary text-lg leading-relaxed mb-4">
                {battle.judgement}
              </p>

              {/* Winner Declaration */}
              {battle.winnerId && phase === "complete" && (
                <motion.div
                  className="text-2xl font-bold text-gradient-gold mt-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ delay: 0.3 }}
                >
                  🏆{" "}
                  {battle.winnerId === battle.agent1.id
                    ? battle.agent1.name
                    : battle.agent2.name}{" "}
                  Wins!
                </motion.div>
              )}
              {!battle.winnerId && phase === "complete" && (
                <motion.div
                  className="text-xl font-bold text-text-secondary mt-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  🤝 Draw!
                </motion.div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <AnimatePresence>
        {phase === "complete" && (
          <motion.div
            className="flex justify-center gap-4 mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <a
              href={
                battle.txSignature
                  ? `https://explorer.solana.com/tx/${battle.txSignature}?cluster=devnet`
                  : `https://explorer.solana.com/address/${battle.id}?cluster=devnet`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm rounded-xl bg-bg-tertiary border border-border text-text-secondary hover:text-accent-cyan hover:border-accent-cyan transition-all"
            >
              ⛓️ {battle.txSignature ? "View Tx on Solana" : "View on Solana"}
            </a>
            <button
              onClick={() => {
                const text = `My agent just ${
                  battle.winnerId ? "won" : "drew"
                } a ${battle.category} battle on Agent Arena! ⚔️🏟️`;
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
                  "_blank"
                );
              }}
              className="px-4 py-2 text-sm rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20 transition-all"
            >
              📤 Share on X
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
