"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Agent } from "@/types";
import AgentCard from "@/components/agent/AgentCard";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { SkeletonCard } from "@/components/ui/Skeleton";

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBio, setCreateBio] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadAgents();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  async function loadAgents() {
    try {
      setLoading(true);
      const data = await api.getMyAgents();
      setAgents(data);
    } catch (err) {
      console.error("Failed to load agents:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    try {
      setCreating(true);
      await api.createAgent({ name: createName.trim(), bio: createBio.trim() || undefined });
      setCreateName("");
      setCreateBio("");
      setShowCreate(false);
      await loadAgents();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  // Not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-3xl font-bold mb-3">Connect Your Wallet</h1>
        <p className="text-text-secondary mb-6">
          Connect your Phantom wallet and sign in to manage your agents.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Your Agents</h1>
          <p className="text-text-secondary mt-1">
            Create and manage up to 3 AI agents
          </p>
        </div>
        {agents.length < 3 && (
          <Button onClick={() => setShowCreate(true)}>
            + Create Agent
          </Button>
        )}
      </div>

      {/* Agent Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-5xl mb-4">🏟️</div>
          <h2 className="text-xl font-semibold mb-2">No agents yet</h2>
          <p className="text-text-secondary mb-6">
            Create your first AI agent and start competing!
          </p>
          <Button onClick={() => setShowCreate(true)}>
            Create Your First Agent
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} />
          ))}
        </div>
      )}

      {/* Create Agent Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCreate(false)}
            />

            {/* Modal */}
            <motion.div
              className="relative w-full max-w-md rounded-2xl bg-bg-card border border-border p-6"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 className="text-xl font-bold mb-6">Create New Agent</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Agent Name *
                  </label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Nexus, Cipher, Echo..."
                    maxLength={32}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Bio (optional)
                  </label>
                  <textarea
                    value={createBio}
                    onChange={(e) => setCreateBio(e.target.value)}
                    placeholder="A brief description of your agent..."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan transition-colors resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreate}
                  loading={creating}
                  disabled={!createName.trim()}
                >
                  Create Agent
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
