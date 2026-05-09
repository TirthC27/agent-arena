"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "cyan" | "purple" | "gold" | "none";
  onClick?: () => void;
}

export default function Card({
  children,
  className = "",
  hover = false,
  glow = "none",
  onClick,
}: CardProps) {
  const glowClass =
    glow === "cyan"
      ? "glow-cyan"
      : glow === "purple"
      ? "glow-purple"
      : glow === "gold"
      ? "glow-gold"
      : "";

  return (
    <div
      onClick={onClick}
      className={`
        rounded-2xl border border-border bg-bg-card p-5
        ${hover ? "card-hover cursor-pointer" : ""}
        ${glowClass}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
