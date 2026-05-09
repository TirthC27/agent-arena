"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  velocity: number;
}

const COLORS = ["#ffd700", "#ff6b9d", "#00f5d4", "#7b61ff", "#ff9500"];

/**
 * Confetti burst animation — fires from center on trigger.
 * Used on victory screen.
 */
export default function Confetti({ trigger }: { trigger: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!trigger) return;

    const newParticles: Particle[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 50,
      y: 50,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: Math.random() * 8 + 4,
      angle: (Math.PI * 2 * i) / 40 + (Math.random() - 0.5) * 0.5,
      velocity: Math.random() * 300 + 200,
    }));

    setParticles(newParticles);

    const timeout = setTimeout(() => setParticles([]), 2500);
    return () => clearTimeout(timeout);
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{
            x: Math.cos(p.angle) * p.velocity,
            y: Math.sin(p.angle) * p.velocity + 200, // gravity
            scale: [0, 1, 0.5],
            opacity: [1, 1, 0],
            rotate: Math.random() * 720,
          }}
          transition={{
            duration: 2,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}
