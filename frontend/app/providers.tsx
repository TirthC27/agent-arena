"use client";

import { ReactNode, useMemo, useCallback } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletError } from "@solana/wallet-adapter-base";
import { AuthProvider } from "@/context/AuthContext";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  const onWalletError = useCallback((error: WalletError) => {
    // Phantom service worker disconnect / locked wallet — benign, user can retry
    if (
      error.name === "WalletConnectionError" ||
      error.name === "WalletDisconnectedError" ||
      error.name === "WalletNotReadyError"
    ) {
      console.warn("[Wallet] Connection issue (safe to ignore):", error.name);
      return;
    }
    console.error("[Wallet] Error:", error);
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
        <WalletModalProvider>
          <AuthProvider>{children}</AuthProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
