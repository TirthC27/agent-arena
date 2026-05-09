import {
  ApiResponse,
  Agent,
  Battle,
  ChatMessage,
  ChatResponse,
  User,
  LeaderboardEntry,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("arena_token", token);
    } else {
      localStorage.removeItem("arena_token");
    }
  }

  loadToken() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("arena_token");
    }
  }

  getToken() {
    return this.token;
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options?.headers,
      },
    });

    const data: ApiResponse<T> = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || `API error: ${res.status}`);
    }

    return data.data;
  }

  // ========== Auth ==========

  async getChallenge(walletAddress: string) {
    return this.request<{ message: string; nonce: string }>("/api/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    });
  }

  async verifySignature(walletAddress: string, signature: string, message: string) {
    return this.request<{ token: string; user: User }>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ walletAddress, signature, message }),
    });
  }

  async getMe() {
    return this.request<User>("/api/auth/me");
  }

  // ========== Agents ==========

  async getMyAgents() {
    return this.request<Agent[]>("/api/agents/my");
  }

  async createAgent(data: { name: string; bio?: string; avatarUrl?: string }) {
    return this.request<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAgent(id: string) {
    return this.request<Agent>("/api/agents/" + id);
  }

  async updateAgent(id: string, data: { name?: string; bio?: string; isActive?: boolean }) {
    return this.request<Agent>("/api/agents/" + id, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // ========== Chat ==========

  async sendMessage(agentId: string, content: string) {
    return this.request<ChatResponse>("/api/chat/" + agentId, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async getChatHistory(agentId: string, limit = 50) {
    return this.request<ChatMessage[]>(`/api/chat/${agentId}/history?limit=${limit}`);
  }

  // ========== Battles ==========

  async joinQueue(agentId: string, category: string) {
    return this.request<{ matched: boolean; battleId?: string; position?: number }>(
      "/api/battles/queue",
      {
        method: "POST",
        body: JSON.stringify({ agentId, category }),
      }
    );
  }

  async getBattle(id: string) {
    return this.request<Battle>("/api/battles/" + id);
  }

  async getBattleHistory(agentId: string) {
    return this.request<Battle[]>("/api/battles/history/" + agentId);
  }

  /**
   * Subscribe to live battle updates via SSE
   */
  subscribeToBattle(battleId: string, onUpdate: (data: Partial<Battle>) => void) {
    const source = new EventSource(`${API_URL}/api/battles/${battleId}/live`);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }

  // ========== Leaderboard ==========

  async getLeaderboard(category?: string, limit = 50) {
    const path = category
      ? `/api/leaderboard/${category}?limit=${limit}`
      : `/api/leaderboard?limit=${limit}`;
    return this.request<LeaderboardEntry[]>(path);
  }
}

export const api = new ApiClient();
