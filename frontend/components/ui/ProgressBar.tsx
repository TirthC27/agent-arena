"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  value: number;          // 0-100
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: "cyan" | "purple" | "gold" | "pink";
  size?: "sm" | "md";
}

const colorClasses = {
  cyan: "from-accent-cyan/80 to-accent-cyan",
  purple: "from-accent-purple/80 to-accent-purple",
  gold: "from-accent-gold/80 to-accent-gold",
  pink: "from-accent-pink/80 to-accent-pink",
};

export default function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  color = "cyan",
  size = "md",
}: ProgressBarProps) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && (
            <span className="text-xs font-medium text-text-secondary">{label}</span>
          )}
          {showValue && (
            <span className="text-xs font-mono text-text-muted">
              {value}/{max}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full rounded-full bg-bg-tertiary overflow-hidden ${
          size === "sm" ? "h-1.5" : "h-2.5"
        }`}
      >
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${colorClasses[color]}`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
