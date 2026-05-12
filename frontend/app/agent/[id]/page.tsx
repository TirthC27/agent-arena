"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Agent, ChatMessage, EvolutionInfo } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EvolutionBadge from "@/components/agent/EvolutionBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import Skeleton from "@/components/ui/Skeleton";
import { formatElo, winRate } from "@/lib/utils";

export default function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectingYt, setConnectingYt] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [evolution, setEvolution] = useState<EvolutionInfo | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadAgent();
    loadChat();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadAgent() {
    try {
      const data = await api.getAgent(id);
      setAgent(data);
      setEvolution(data.evolution);
    } catch (err) {
      console.error("Failed to load agent:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadChat() {
    try {
      const data = await api.getChatHistory(id);
      setMessages(data);
    } catch { /* ignore for non-owners */ }
  }

  async function handleConnectYt() {
    try {
      setConnectingYt(true);
      const res = await api.getYtDnaAuthUrl(id);
      window.location.href = res.url;
    } catch (err: any) {
      alert("Failed to connect YouTube: " + err.message);
      setConnectingYt(false);
    }
  }

  async function handleDeleteAgent() {
    if (!confirm(`Are you sure you want to completely delete ${agent?.name}? This action cannot be undone.`)) return;
    try {
      setDeleting(true);
      await api.deleteAgent(id);
      router.push("/dashboard");
    } catch (err: any) {
      alert("Failed to delete agent: " + err.message);
      setDeleting(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");

    // Optimistic update
    const optimistic: ChatMessage = {
      id: "temp-" + Date.now(),
      agentId: id,
      role: "user",
      content: msg,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);

    try {
      const res = await api.sendMessage(id, msg);
      const agentMsg: ChatMessage = {
        id: "resp-" + Date.now(),
        agentId: id,
        role: "agent",
        content: res.reply,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, agentMsg]);
      if (res.evolution) setEvolution(res.evolution);
    } catch (err: any) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-3">❌</div>
        <p className="text-text-secondary">Agent not found</p>
      </div>
    );
  }

  const wr = winRate(agent.totalWins, agent.totalLosses, agent.totalDraws);
  const traits = [
    { name: "Analytical", value: agent.traitAnalytical, color: "cyan" as const },
    { name: "Creative", value: agent.traitCreative, color: "purple" as const },
    { name: "Aggressive", value: agent.traitAggressive, color: "pink" as const },
    { name: "Cautious", value: agent.traitCautious, color: "gold" as const },
    { name: "Social", value: agent.traitSocial, color: "cyan" as const },
    { name: "Strategic", value: agent.traitStrategic, color: "purple" as const },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Agent Header */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-border flex items-center justify-center text-3xl font-bold shrink-0">
            {agent.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <Badge variant={agent.isActive ? "green" : "gray"}>
                  {agent.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              {user?.id === agent.userId && (
                <Button 
                  variant="danger"
                  size="sm" 
                  onClick={handleDeleteAgent}
                  loading={deleting}
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                >
                  Delete Agent
                </Button>
              )}
            </div>
            {agent.bio && (
              <p className="text-text-secondary mb-3">{agent.bio}</p>
            )}
            {evolution && (
              <EvolutionBadge evolution={evolution} showProgress size="md" />
            )}
            
            {user?.id === agent.userId && !agent.ytInitialized && (
              <div className="mt-4">
                <Button 
                  onClick={handleConnectYt} 
                  loading={connectingYt}
                  className="bg-[#FF0000] hover:bg-[#CC0000] text-white border-none"
                >
                  <span className="mr-2 font-bold text-lg leading-none mt-[-2px]">▶</span>
                  Initialize with YouTube DNA
                </Button>
                <p className="text-xs text-text-muted mt-2">
                  Analyze your watch history to generate a unique personality.
                </p>
              </div>
            )}
            {agent.ytInitialized && agent.ytArchetypeName && (
              <div className="mt-4">
                <Badge variant="purple">
                  🧬 DNA: {agent.ytArchetypeName}
                </Badge>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-accent-cyan">
                {formatElo(agent.eloOverall)}
              </div>
              <div className="text-xs text-text-muted">ELO</div>
            </div>
            <div>
              <div className="text-xl font-bold text-accent-gold">{wr}%</div>
              <div className="text-xs text-text-muted">Win Rate</div>
            </div>
            <div>
              <div className="text-xl font-bold">
                <span className="text-green-400">{agent.totalWins}</span>
                <span className="text-text-muted">/</span>
                <span className="text-accent-pink">{agent.totalLosses}</span>
              </div>
              <div className="text-xs text-text-muted">W/L</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personality Traits */}
        <Card>
          <h3 className="font-semibold mb-4">Personality Profile</h3>
          <div className="space-y-3">
            {traits.map((trait) => (
              <ProgressBar
                key={trait.name}
                value={trait.value ?? 0}
                max={100}
                label={trait.name}
                color={trait.color}
                size="sm"
              />
            ))}
          </div>
          {!traits.some((t) => t.value !== null) && (
            <p className="text-text-muted text-sm mt-4">
              Chat with your agent to discover its personality!
            </p>
          )}
        </Card>

        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[500px]">
            <h3 className="font-semibold mb-4">
              Chat with {agent.name}
            </h3>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
              {messages.length === 0 && (
                <p className="text-text-muted text-sm text-center py-8">
                  Start chatting to shape {agent.name}&apos;s personality!
                </p>
              )}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-accent-cyan/10 text-text-primary rounded-br-md"
                        : "bg-bg-tertiary text-text-primary rounded-bl-md"
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-bg-tertiary px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 rounded-full bg-accent-cyan"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Message ${agent.name}...`}
                className="flex-1 px-4 py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan transition-colors"
                disabled={sending}
              />
              <Button type="submit" loading={sending} disabled={!input.trim()}>
                Send
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
