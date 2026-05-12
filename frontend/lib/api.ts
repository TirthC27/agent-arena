import {
  ApiResponse,
  Agent,
  Battle,
  ChatMessage,
  ChatResponse,
  User,
  LeaderboardEntry,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://agent-arena-750648121075.asia-south1.run.app";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("arena_token", token);
      else localStorage.removeItem("arena_token");
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

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options?.headers,
      },
    });

    const contentType = res.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      throw new Error(`API error: ${res.status} — expected JSON. Body: ${text.slice(0, 200)}`);
    }

    const data: ApiResponse<T> = await res.json();

    if (!res.ok || !data.success) {
      throw new Error((data as any).error || `API error: ${res.status}`);
    }

    return data.data;
  }

  // Generic helpers for new routes
  async get(path: string) {
    return fetch(`${API_URL}/api${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    });
  }

  async post(path: string, body?: unknown) {
    return fetch(`${API_URL}/api${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    });
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

  async logout() {
    try {
      await this.request<void>("/api/auth/logout", { method: "POST" });
    } catch {}
    finally {
      this.setToken(null);
    }
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

  async deleteAgent(id: string) {
    return this.request<{ success: boolean; message: string }>("/api/agents/" + id, {
      method: "DELETE",
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
      "/api/battle/queue",
      { method: "POST", body: JSON.stringify({ agentId, category }) }
    );
  }

  async getBattle(id: string) {
    return this.request<Battle>("/api/battle/" + id);
  }

  async getBattleHistory(agentId: string) {
    return this.request<Battle[]>("/api/battle/history/" + agentId);
  }

  // ========== Training ==========

  async trainAgent(agentId: string, domain: string) {
    return this.request<any>("/api/training/train", {
      method: "POST",
      body: JSON.stringify({ agentId, domain }),
    });
  }

  async getAgentSkills(agentId: string) {
    return this.request<any[]>("/api/training/skills/" + agentId);
  }

  // ========== Campaigns ==========

  async getCampaigns() {
    return this.request<any[]>("/api/campaign");
  }

  async getCampaign(id: string) {
    return this.request<any>("/api/campaign/" + id);
  }

  async joinCampaign(campaignId: string, agentId: string) {
    return this.request<any>("/api/campaign/join", {
      method: "POST",
      body: JSON.stringify({ campaignId, agentId }),
    });
  }

  // ========== Leaderboard ==========

  async getLeaderboard(type = "global", limit = 50) {
    return this.request<LeaderboardEntry[]>(`/api/leaderboard?type=${type}&limit=${limit}`);
  }

  // ========== Wallet ==========

  async fundAgent(agentId: string, amountSOL: number, txSignature?: string) {
    return this.request<any>("/api/wallet/fund", {
      method: "POST",
      body: JSON.stringify({ agentId, amountSOL, txSignature }),
    });
  }

  async getAgentBalance(agentId: string) {
    return this.request<{ balance: number }>("/api/wallet/balance/" + agentId);
  }

  // ========== Rewards ==========

  async getRewards() {
    return this.request<any[]>("/api/rewards");
  }

  async claimReward(rewardId: string) {
    return this.request<any>("/api/rewards/claim", {
      method: "POST",
      body: JSON.stringify({ rewardId }),
    });
  }

  // ========== YT-DNA ==========

  async getYtDnaAuthUrl(agentId: string) {
    return this.request<{ url: string }>(`/api/ytdna/auth-url?agentId=${agentId}`);
  }

  async getYtDnaProfile(agentId: string) {
    return this.request<any>(`/api/ytdna/profile/${agentId}`);
  }

  // ========== Autonomy (Agent AI) ==========

  async getAgentThoughts(agentId: string, limit = 20) {
    return this.request<any[]>(`/api/autonomy/thoughts/${agentId}?limit=${limit}`);
  }

  async getEcosystemThoughts(limit = 20) {
    return this.request<any[]>(`/api/autonomy/thoughts?limit=${limit}`);
  }

  async getAgentActions(agentId: string, limit = 20) {
    return this.request<any[]>(`/api/autonomy/actions/${agentId}?limit=${limit}`);
  }

  async getEcosystemActions(limit = 30) {
    return this.request<any[]>(`/api/autonomy/actions?limit=${limit}`);
  }

  async triggerAgentDecision(agentId: string) {
    return this.request<any>(`/api/autonomy/decide/${agentId}`, { method: "POST" });
  }

  async getCampaignStats() {
    return this.request<any>(`/api/campaign/stats`);
  }

  async getEcosystemEngagement() {
    return this.request<any>(`/api/autonomy/engagement`);
  }

  async getAgentEngagement(agentId: string) {
    return this.request<any>(`/api/autonomy/engagement/${agentId}`);
  }

  async getAgentCreatedCampaigns(agentId: string) {
    return this.request<any[]>(`/api/autonomy/campaigns-by-agent/${agentId}`);
  }
}

export const api = new ApiClient();

