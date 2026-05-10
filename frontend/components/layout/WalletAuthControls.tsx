"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/context/AuthContext";
import { truncateAddress } from "@/lib/utils";

export default function WalletAuthControls() {
  const { connected } = useWallet();
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();

  if (isAuthenticated && user) {
    return (
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
    );
  }

  if (connected && !isAuthenticated) {
    return (
      <button
        onClick={login}
        disabled={isLoading}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20 transition-all disabled:opacity-50"
      >
        {isLoading ? "Signing..." : "Sign In"}
      </button>
    );
  }

  return <WalletMultiButton />;
}
