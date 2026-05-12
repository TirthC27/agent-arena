"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "cyan" | "purple" | "pink" | "gold" | "gray" | "green";
  size?: "sm" | "md";
  className?: string;
}

const variantClasses = {
  cyan: "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20",
  purple: "bg-accent-purple/10 text-accent-purple border-accent-purple/20",
  pink: "bg-accent-pink/10 text-accent-pink border-accent-pink/20",
  gold: "bg-accent-gold/10 text-accent-gold border-accent-gold/20",
  gray: "bg-bg-tertiary text-text-secondary border-border",
  green: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function Badge({ children, variant = "cyan", size = "sm", className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${variantClasses[variant]}
        ${size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
