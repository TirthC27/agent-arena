"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";

const WalletAuthControls = dynamic(() => import("./WalletAuthControls"), {
  ssr: false,
  loading: () => <WalletButtonPlaceholder />,
});

function WalletButtonPlaceholder() {
  return (
    <button
      type="button"
      disabled
      className="wallet-adapter-button wallet-adapter-button-trigger"
    >
      Select Wallet
    </button>
  );
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/battle", label: "Battle", icon: "⚔️" },
  { href: "/arena", label: "Campaigns", icon: "🏆" },
  { href: "/training", label: "Training", icon: "🧠" },
  { href: "/leaderboard", label: "Leaderboard", icon: "📊" },
];


export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🏟️</span>
            <span className="text-xl font-bold text-gradient">
              Agent Arena
            </span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  pathname === link.href
                    ? "bg-bg-tertiary text-accent-cyan"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                }`}
              >
                <span className="mr-1.5">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Wallet + Auth */}
          <div className="flex items-center gap-3">
            <WalletAuthControls />
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="md:hidden flex border-t border-border">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 py-3 text-center text-xs font-medium transition-all ${
              pathname === link.href
                ? "text-accent-cyan border-b-2 border-accent-cyan"
                : "text-text-secondary"
            }`}
          >
            <div>{link.icon}</div>
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
