"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Typewriter effect — reveals text character by character.
 * Creates the illusion that the AI is "thinking and typing".
 */
export default function Typewriter({
  text,
  speed = 25,
  delay = 0,
  onComplete,
  className = "",
}: {
  text: string;
  speed?: number;
  delay?: number;
  onComplete?: () => void;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) {
      onComplete?.();
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, speed);

    return () => clearTimeout(timeout);
  }, [displayed, started, text, speed, onComplete]);

  return (
    <span className={className}>
      {displayed}
      {started && displayed.length < text.length && (
        <motion.span
          className="inline-block w-0.5 h-4 bg-accent-cyan ml-0.5 align-middle"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </span>
  );
}
