"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Animated score counter — counts from 0 to target value.
 * Creates dramatic score reveal effect during battle judging.
 */
export default function ScoreCounter({
  target,
  duration = 1500,
  delay = 0,
  className = "",
}: {
  target: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [started, target, duration]);

  const color =
    target >= 80
      ? "text-accent-gold"
      : target >= 60
      ? "text-accent-cyan"
      : target >= 40
      ? "text-text-primary"
      : "text-accent-pink";

  return (
    <motion.span
      className={`font-bold tabular-nums ${color} ${className}`}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={started ? { scale: 1, opacity: 1 } : {}}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
    >
      {value}
    </motion.span>
  );
}
