"use client";

import { EvolutionInfo } from "@/types";
import { TIER_COLORS } from "@/lib/utils";
import ProgressBar from "@/components/ui/ProgressBar";

interface EvolutionBadgeProps {
  evolution: EvolutionInfo;
  showProgress?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function EvolutionBadge({
  evolution,
  showProgress = false,
  size = "md",
}: EvolutionBadgeProps) {
  const tierColor = TIER_COLORS[evolution.level] || "text-gray-400";

  const progressColor =
    evolution.level >= 4
      ? "gold"
      : evolution.level >= 3
      ? "purple"
      : "cyan";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={
            size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm"
          }
        >
          {evolution.emoji}
        </span>
        <span
          className={`font-semibold ${tierColor} ${
            size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-xs"
          }`}
        >
          {evolution.title}
        </span>
        <span className="text-xs text-text-muted">Lv.{evolution.level}</span>
      </div>

      {showProgress && evolution.nextLevelXP && (
        <ProgressBar
          value={evolution.xp}
          max={evolution.nextLevelXP}
          label={`${evolution.xp} / ${evolution.nextLevelXP} XP`}
          showValue={false}
          color={progressColor}
          size="sm"
        />
      )}
    </div>
  );
}
