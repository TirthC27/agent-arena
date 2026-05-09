"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EvolutionBadge from "@/components/agent/EvolutionBadge";
import { Agent } from "@/types";
import { winRate, formatElo } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
  index?: number;
}

export default function AgentCard({ agent, index = 0 }: AgentCardProps) {
  const router = useRouter();
  const wr = winRate(agent.totalWins, agent.totalLosses, agent.totalDraws);
  const totalBattles = agent.totalWins + agent.totalLosses + agent.totalDraws;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
    >
      <Card hover onClick={() => router.push(`/agent/${agent.id}`)}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-border flex items-center justify-center text-xl">
              {agent.avatarUrl ? (
                <img
                  src={agent.avatarUrl}
                  alt={agent.name}
                  className="w-full h-full rounded-xl object-cover"
                />
              ) : (
                agent.name.charAt(0).toUpperCase()
              )}
            </div>

            <div>
              <h3 className="font-semibold text-text-primary">{agent.name}</h3>
              <EvolutionBadge evolution={agent.evolution} size="sm" />
            </div>
          </div>

          <Badge variant={agent.isActive ? "green" : "gray"}>
            {agent.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* Bio */}
        {agent.bio && (
          <p className="text-sm text-text-secondary mb-4 line-clamp-2">
            {agent.bio}
          </p>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-bg-tertiary">
            <div className="text-sm font-bold text-accent-cyan">
              {formatElo(agent.eloOverall)}
            </div>
            <div className="text-xs text-text-muted">ELO</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-bg-tertiary">
            <div className="text-sm font-bold text-accent-gold">
              {totalBattles > 0 ? `${wr}%` : "—"}
            </div>
            <div className="text-xs text-text-muted">Win Rate</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-bg-tertiary">
            <div className="text-sm font-bold text-text-primary">
              <span className="text-green-400">{agent.totalWins}</span>
              <span className="text-text-muted">/</span>
              <span className="text-accent-pink">{agent.totalLosses}</span>
            </div>
            <div className="text-xs text-text-muted">W/L</div>
          </div>
        </div>

        {/* XP Progress */}
        {agent.evolution && (
          <div className="mt-4">
            <EvolutionBadge
              evolution={agent.evolution}
              showProgress
              size="sm"
            />
          </div>
        )}
      </Card>
    </motion.div>
  );
}
