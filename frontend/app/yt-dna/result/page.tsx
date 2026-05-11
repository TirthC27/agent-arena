"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import Skeleton from "@/components/ui/Skeleton";

function YtDnaResultContent() {
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId");
  
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (agentId) {
      loadProfile(agentId);
    } else {
      setError("No agent ID provided");
      setLoading(false);
    }
  }, [agentId]);

  async function loadProfile(id: string) {
    try {
      setLoading(true);
      const data = await api.getYtDnaProfile(id);
      setProfile(data.fullProfile);
    } catch (err: any) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto mt-10 p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <div className="text-4xl">❌</div>
        <h1 className="text-xl font-bold">Failed to load result</h1>
        <p className="text-text-secondary">{error}</p>
        <Link href={`/agent/${agentId || ''}`}>
          <Button>Back to Agent</Button>
        </Link>
      </div>
    );
  }

  const { agent, personality, domains, memory, metadata } = profile;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-accent-cyan to-accent-purple bg-clip-text text-transparent">
          DNA Extraction Complete
        </h1>
        <p className="text-text-secondary text-lg max-w-2xl mx-auto">
          We analyzed {metadata.youtube_stats.likedCount} liked videos and {metadata.youtube_stats.subscriptionCount} subscriptions to generate this unique agent persona.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="col-span-1 md:col-span-3 text-center py-8 bg-gradient-to-br from-accent-purple/10 to-transparent border-accent-purple/30">
          <div className="text-5xl mb-4">🧬</div>
          <h2 className="text-3xl font-bold mb-2">{agent.name}</h2>
          <p className="text-text-primary text-lg mb-4">{agent.description}</p>
          <div className="inline-block px-4 py-2 bg-bg-tertiary rounded-lg border border-border">
            <span className="text-text-muted text-sm uppercase tracking-wider block mb-1">Signature Phrase</span>
            <span className="italic font-medium text-accent-cyan">&quot;{agent.signature_phrase}&quot;</span>
          </div>
        </Card>

        <Card className="col-span-1 md:col-span-2 space-y-6">
          <h3 className="text-xl font-bold border-b border-border pb-2">Personality Blueprint</h3>
          <div className="space-y-4">
            <ProgressBar value={personality.analytical} max={100} label="Analytical" color="cyan" size="md" />
            <ProgressBar value={personality.creative} max={100} label="Creative" color="purple" size="md" />
            <ProgressBar value={personality.aggressive} max={100} label="Aggressive" color="pink" size="md" />
            <ProgressBar value={personality.cautious} max={100} label="Cautious" color="gold" size="md" />
            <ProgressBar value={personality.social} max={100} label="Social" color="cyan" size="md" />
            <ProgressBar value={personality.strategic} max={100} label="Strategic" color="purple" size="md" />
          </div>
        </Card>

        <Card className="col-span-1 space-y-6">
          <h3 className="text-xl font-bold border-b border-border pb-2">Intellectual Domains</h3>
          <div className="space-y-4">
            {domains.map((d: any, i: number) => (
              <div key={i} className="flex justify-between items-center bg-bg-tertiary p-3 rounded-xl border border-border">
                <div>
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs text-text-muted capitalize">{d.depth}</div>
                </div>
                <div className="text-accent-cyan font-bold">{d.percentage}%</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-span-1 md:col-span-3 space-y-4">
          <h3 className="text-xl font-bold border-b border-border pb-2">Battle Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold text-text-muted uppercase mb-2">Battle Style</h4>
              <p className="text-text-primary bg-bg-tertiary p-4 rounded-xl border border-border">{agent.battle_style}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-muted uppercase mb-2">Weak Domain</h4>
              <p className="text-accent-pink bg-accent-pink/10 p-4 rounded-xl border border-accent-pink/20">{agent.weak_domain}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="text-center mt-8">
        <Link href={`/agent/${agentId}`}>
          <Button size="lg" className="px-8 shadow-lg shadow-accent-cyan/20">
            Return to Agent Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function YtDnaResultPage() {
  return (
    <Suspense fallback={<div className="text-center mt-20">Loading...</div>}>
      <YtDnaResultContent />
    </Suspense>
  );
}
