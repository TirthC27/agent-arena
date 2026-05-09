"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/context/AuthContext";
import { truncateAddress } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/arena", label: "Arena", icon: "⚔️" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { connected } = useWallet();
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();

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
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:block text-sm text-text-secondary">
                  {truncateAddress(user.walletAddress)}
                </span>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-xs rounded-lg bg-bg-tertiary border border-border text-text-secondary hover:text-accent-pink hover:border-accent-pink transition-all"
                >
                  Logout
                </button>
              </div>
            ) : connected && !isAuthenticated ? (
              <button
                onClick={login}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20 transition-all disabled:opacity-50"
              >
                {isLoading ? "Signing..." : "Sign In"}
              </button>
            ) : (
              <WalletMultiButton />
            )}
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
