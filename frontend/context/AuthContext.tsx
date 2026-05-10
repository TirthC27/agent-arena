"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "@/lib/api";
import { User } from "@/types";
import bs58 from "bs58";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const prevPublicKeyRef = useRef<string | null>(null);

  // Try to restore session on mount
  useEffect(() => {
    api.loadToken();
    if (api.getToken()) {
      api
        .getMe()
        .then(setUser)
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Clear session when wallet disconnects or wallet address changes
  useEffect(() => {
    const currentKey = publicKey?.toBase58() ?? null;

    if (!connected || !publicKey) {
      // Wallet disconnected — clear auth state
      if (user) {
        api.setToken(null);
        setUser(null);
      }
    } else if (
      prevPublicKeyRef.current &&
      currentKey !== prevPublicKeyRef.current
    ) {
      // Wallet address changed (user switched wallet) — clear stale session
      api.setToken(null);
      setUser(null);
    }

    prevPublicKeyRef.current = currentKey;
  }, [connected, publicKey]);

  // Sign message and authenticate with backend
  const login = useCallback(async () => {
    if (!publicKey || !signMessage) return;

    try {
      setIsLoading(true);
      const walletAddress = publicKey.toBase58();

      // 1. Get challenge message from backend
      const { message } = await api.getChallenge(walletAddress);

      // 2. Sign with Phantom
      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);
      const signatureBase58 = bs58.encode(signature);

      // 3. Verify with backend and get JWT
      const { token, user: userData } = await api.verifySignature(
        walletAddress,
        signatureBase58,
        message
      );

      api.setToken(token);
      setUser(userData);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage]);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
    disconnect();
  }, [disconnect]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
