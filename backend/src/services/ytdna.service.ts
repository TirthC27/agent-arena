import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";

// ============================================================
// Types
// ============================================================

interface DistilledVideo {
  title: string;
  channel: string;
  duration?: string;
  category?: string;
}

interface Domain {
  name: string;
  percentage: number;
  depth: "consumer" | "practitioner" | "builder";
  top_channels: string[];
  insight: string;
}

interface TraitScore {
  score: number;
  rationale: string;
  strongest_evidence: string;
}

interface DomainAnalysis {
  domains: Domain[];
}

interface TraitAnalysis {
  traits: {
    analytical: TraitScore;
    creative: TraitScore;
    aggressive: TraitScore;
    cautious: TraitScore;
    social: TraitScore;
    strategic: TraitScore;
  };
}

interface ArchetypeAnalysis {
  archetype_name: string;
  archetype_description: string;
  battle_style: string;
  system_prompt: string;
  signature_phrase: string;
  weak_domain: string;
}

export interface FinalAgentProfile {
  agent: {
    name: string;
    description: string;
    system_prompt: string;
    signature_phrase: string;
    battle_style: string;
    weak_domain: string;
  };
  personality: {
    analytical: number;
    creative: number;
    aggressive: number;
    cautious: number;
    social: number;
    strategic: number;
  };
  domains: Array<{
    name: string;
    percentage: number;
    depth: "consumer" | "practitioner" | "builder";
  }>;
  memory: {
    memory_version: "init_from_yt_dna";
    intellectual_background: {
      primary_domain: string;
      depth_level: string;
      cross_domain_fluency: string[];
    };
    reasoning_style: string;
    known_biases: string[];
    past_battles: never[];
  };
  metadata: {
    source: "youtube_oauth";
    youtube_stats: { likedCount: number; subscriptionCount: number };
  };
}

// ============================================================
// OAuth helpers
// ============================================================

function buildOAuthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL for YouTube readonly scope.
 * We embed the agentId in the state param so the callback knows which agent to update.
 */
export function getAuthUrl(agentId: string, userId: string): string {
  const oauth2Client = buildOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/youtube.readonly"],
    state: JSON.stringify({ agentId, userId }),
    prompt: "consent",
  });
}

// ============================================================
// YouTube Data Fetching
// ============================================================

async function fetchLikedVideos(oauth2Client: ReturnType<typeof buildOAuthClient>): Promise<DistilledVideo[]> {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const videos: DistilledVideo[] = [];
  let pageToken: string | undefined;

  do {
    const response = await youtube.videos.list({
      part: ["snippet", "contentDetails"],
      myRating: "like",
      maxResults: 50,
      ...(pageToken && { pageToken }),
    });

    const items = response.data.items || [];
    for (const item of items) {
      videos.push({
        title: item.snippet?.title || "Unknown",
        channel: item.snippet?.channelTitle || "Unknown",
        duration: item.contentDetails?.duration || undefined,
        category: item.snippet?.categoryId || undefined,
      });
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken && videos.length < 200);

  return videos.slice(0, 200);
}

async function fetchSubscriptions(oauth2Client: ReturnType<typeof buildOAuthClient>): Promise<string[]> {
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channels: string[] = [];
  let pageToken: string | undefined;

  do {
    const response = await youtube.subscriptions.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      ...(pageToken && { pageToken }),
    });

    const items = response.data.items || [];
    for (const item of items) {
      const name = item.snippet?.title;
      if (name) channels.push(name);
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return channels;
}

// ============================================================
// Claude AI 3-Step Pipeline
// ============================================================

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

async function callClaude(prompt: string): Promise<string> {
  try {
    // Switching to OpenRouter to bypass Anthropic direct API credit exhaustion
    const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.FRONTEND_URL || "https://agent-arena-chi-amber.vercel.app",
        "X-Title": "Agent Arena"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", // Switching to GPT-4o-mini via OpenRouter for high reliability & JSON adherence
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0]?.message?.content;

    if (!content) throw new Error("Unexpected empty response from OpenRouter");
    return content;
  } catch (err) {
    console.warn("[CLAUDE] API Error or Token Exhaustion, falling back to baseline generation:", err);
    return ""; // Empty string fails JSON parse and triggers baseline fallbacks
  }
}

function safeParseJson<T>(text: string, fallback: T, stepName: string = "Unknown Step"): T {
  try {
    if (!text || text.trim() === "") {
      throw new Error("Empty response string");
    }

    // Extract everything between first { and last } to ignore conversational text
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      const clean = text.substring(startIndex, endIndex + 1);
      return JSON.parse(clean) as T;
    }

    // Fallback attempt
    const cleanAlt = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanAlt) as T;
  } catch (err) {
    console.error(`[JSON PARSE ERROR in ${stepName}] Failed to parse. Text preview:`, text.substring(0, 150));
    return fallback;
  }
}

function baselineTraits(): TraitAnalysis {
  const baseline: TraitScore = { score: 50, rationale: "Baseline score", strongest_evidence: "N/A" };
  return {
    traits: {
      analytical: { ...baseline },
      creative: { ...baseline },
      aggressive: { ...baseline },
      cautious: { ...baseline },
      social: { ...baseline },
      strategic: { ...baseline },
    },
  };
}

function baselineDomains(): DomainAnalysis {
  return {
    domains: [{ name: "General", percentage: 100, depth: "consumer", top_channels: [], insight: "Baseline domain" }],
  };
}

function baselineArchetype(): ArchetypeAnalysis {
  return {
    archetype_name: "Balanced Thinker",
    archetype_description: "A well-rounded agent with balanced capabilities across all domains.",
    battle_style: "Adapts to the situation with a measured approach.",
    system_prompt: "You are a balanced, thoughtful AI agent. Approach every challenge with careful reasoning and a willingness to consider multiple perspectives. Be direct but fair in your arguments.",
    signature_phrase: "Every challenge has a solution waiting to be found.",
    weak_domain: "Highly specialized technical debates",
  };
}

// Step 1: Domain Clustering
async function step1DomainClustering(data: { videos: DistilledVideo[]; subscriptions: string[] }): Promise<DomainAnalysis> {
  const prompt = `You are an intelligence analyst. Analyze this YouTube activity data and identify the user's core intellectual domains.

For each domain, provide:
- Domain name (e.g., "AI & Machine Learning", "Startup Strategy", "Philosophy of Mind")
- Percentage of overall activity (must sum to 100)
- Depth signal: "consumer" (watches explainers) | "practitioner" (watches technical content) | "builder" (watches implementation content)
- Top 3 representative channels for this domain
- Key insight about what this domain reveals about how the person thinks

Return as JSON only. No preamble, no markdown code fences. Schema:
{
  "domains": [
    {
      "name": string,
      "percentage": number,
      "depth": "consumer" | "practitioner" | "builder",
      "top_channels": string[],
      "insight": string
    }
  ]
}

YouTube Activity Data:
${JSON.stringify(data, null, 2)}`;

  const raw = await callClaude(prompt);
  return safeParseJson<DomainAnalysis>(raw, baselineDomains(), "Step 1: Domain Clustering");
}

// Step 2: Personality Trait Derivation
async function step2TraitDerivation(domains: DomainAnalysis): Promise<TraitAnalysis> {
  const prompt = `You are a behavioral psychologist specializing in AI agent design.
 
 Based on this intellectual domain profile, derive scores (0-100) for each of the 6 core personality dimensions of the Agent Arena:
 
 1. Analytical — logical depth, data-driven reasoning, interest in complex systems.
 2. Creative — lateral thinking, interest in arts/innovation, novelty-seeking.
 3. Aggressive — dominance, competitiveness, confrontational vs passive tone.
 4. Cautious — risk-aversion, safety-focus, thoroughness vs impulsiveness.
 5. Social — empathy, community-focus, interpersonal vs technical orientation.
 6. Strategic — long-term planning, game theory, resource optimization.
 
 For each trait, provide:
 - score: 0-100
 - rationale: one sentence explaining the score based on their YouTube interests
 - strongest_evidence: the specific channel or domain that drove this score
 
 Return as JSON only.
 {
   "traits": {
     "analytical": { "score": number, "rationale": string, "strongest_evidence": string },
     "creative": { "score": number, "rationale": string, "strongest_evidence": string },
     "aggressive": { "score": number, "rationale": string, "strongest_evidence": string },
     "cautious": { "score": number, "rationale": string, "strongest_evidence": string },
     "social": { "score": number, "rationale": string, "strongest_evidence": string },
     "strategic": { "score": number, "rationale": string, "strongest_evidence": string }
   }
 }
 
 Domain Profile:
 ${JSON.stringify(domains, null, 2)}`;

  const raw = await callClaude(prompt);
  return safeParseJson<TraitAnalysis>(raw, baselineTraits(), "Step 2: Trait Derivation");
}

// Step 3: Archetype & System Prompt Generation
async function step3ArchetypeGeneration(
  domains: DomainAnalysis,
  traits: TraitAnalysis,
  topChannels: string[]
): Promise<ArchetypeAnalysis> {
  const prompt = `You are a creative AI architect. Design a unique AI agent persona based on this profile.

Generate:
1. archetype_name: A unique, memorable 2-word archetype name (e.g., "Pragmatic Visionary", "Systematic Contrarian")
2. archetype_description: 2-3 sentences describing this agent's intellectual character
3. battle_style: How this agent approaches Arena battles — what's its natural strategy
4. system_prompt: A complete system prompt (300-400 words) that encodes this personality for use as an LLM system prompt. The system prompt should instruct the AI to embody this personality consistently.
5. signature_phrase: One sentence this agent says at the start of every battle (captures its voice)
6. weak_domain: The domain where this agent will struggle and why

Return as JSON only. No preamble, no markdown code fences. Schema:
{
  "archetype_name": string,
  "archetype_description": string,
  "battle_style": string,
  "system_prompt": string,
  "signature_phrase": string,
  "weak_domain": string
}

Domain Profile:
${JSON.stringify(domains, null, 2)}

Trait Profile:
${JSON.stringify(traits, null, 2)}

Top Channels:
${JSON.stringify(topChannels, null, 2)}`;

  const raw = await callClaude(prompt);
  return safeParseJson<ArchetypeAnalysis>(raw, baselineArchetype(), "Step 3: Archetype Generation");
}

// ============================================================
// Main Pipeline Entry Point
// ============================================================

export async function runYtDnaPipeline(code: string, agentId: string, userId: string): Promise<FinalAgentProfile> {
  // Exchange OAuth code for tokens
  const oauth2Client = buildOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Fetch YouTube data
  const [videos, subscriptions] = await Promise.all([
    fetchLikedVideos(oauth2Client),
    fetchSubscriptions(oauth2Client),
  ]);

  // Edge case: thin data
  if (videos.length < 5 && subscriptions.length < 5) {
    throw ApiError.badRequest(
      "Not enough YouTube activity found. Please use an account with at least 5 liked videos or 5 subscriptions."
    );
  }

  // Run 3-step Claude pipeline
  const domainAnalysis = await step1DomainClustering({ videos, subscriptions });
  const traitAnalysis = await step2TraitDerivation(domainAnalysis);

  // Extract top 10 channels from videos
  const channelFreq: Record<string, number> = {};
  for (const v of videos) {
    channelFreq[v.channel] = (channelFreq[v.channel] || 0) + 1;
  }
  const topChannels = Object.entries(channelFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ch]) => ch);

  const archetypeAnalysis = await step3ArchetypeGeneration(domainAnalysis, traitAnalysis, topChannels);

  // Assemble final profile
  const primaryDomain = domainAnalysis.domains[0];
  const crossDomain = domainAnalysis.domains.slice(1).map((d) => d.name);

  const profile: FinalAgentProfile = {
    agent: {
      name: archetypeAnalysis.archetype_name,
      description: archetypeAnalysis.archetype_description,
      system_prompt: archetypeAnalysis.system_prompt,
      signature_phrase: archetypeAnalysis.signature_phrase,
      battle_style: archetypeAnalysis.battle_style,
      weak_domain: archetypeAnalysis.weak_domain,
    },
    personality: {
      analytical: traitAnalysis.traits.analytical.score,
      creative: traitAnalysis.traits.creative.score,
      aggressive: traitAnalysis.traits.aggressive.score,
      cautious: traitAnalysis.traits.cautious.score,
      social: traitAnalysis.traits.social.score,
      strategic: traitAnalysis.traits.strategic.score,
    },
    domains: domainAnalysis.domains.map((d) => ({
      name: d.name,
      percentage: d.percentage,
      depth: d.depth,
    })),
    memory: {
      memory_version: "init_from_yt_dna",
      intellectual_background: {
        primary_domain: primaryDomain?.name || "General",
        depth_level: primaryDomain?.depth || "consumer",
        cross_domain_fluency: crossDomain,
      },
      reasoning_style: traitAnalysis.traits.analytical.score > 60
        ? "analytical"
        : traitAnalysis.traits.creative.score > 60
          ? "lateral"
          : "balanced",
      known_biases: domainAnalysis.domains.slice(0, 3).map((d) => d.insight),
      past_battles: [],
    },
    metadata: {
      source: "youtube_oauth",
      youtube_stats: {
        likedCount: videos.length,
        subscriptionCount: subscriptions.length,
      },
    },
  };

  // Persist to database
  await saveProfileToAgent(agentId, userId, profile, domainAnalysis.domains);

  return profile;
}

// ============================================================
// Database persistence
// ============================================================

async function saveProfileToAgent(
  agentId: string,
  userId: string,
  profile: FinalAgentProfile,
  domains: Domain[]
) {
  // Verify ownership
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  // Update agent with YT-DNA traits and identity
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      ytRiskAppetite: profile.personality.strategic, // Mapping back to old columns for DB compatibility
      ytLogicDominance: profile.personality.analytical,
      ytCompetitiveness: profile.personality.aggressive,
      ytEmotionalStability: profile.personality.cautious,
      ytAdaptability: profile.personality.creative,
      ytArchetypeName: profile.agent.name,
      ytSystemPrompt: profile.agent.system_prompt,
      ytSignaturePhrase: profile.agent.signature_phrase,
      ytBattleStyle: profile.agent.battle_style,
      ytWeakDomain: profile.agent.weak_domain,
      ytInitialized: true,
      // Also write to the bio and existing traits for battle compatibility
      bio: profile.agent.description,
      traitAnalytical: profile.personality.analytical,
      traitStrategic: profile.personality.strategic,
      traitAggressive: profile.personality.aggressive,
      traitCautious: profile.personality.cautious,
      traitCreative: profile.personality.creative,
      traitSocial: profile.personality.social,
    },
  });

  // Upsert YtDnaProfile
  await (prisma as any).ytDnaProfile.upsert({
    where: { agentId },
    update: {
      likedCount: profile.metadata.youtube_stats.likedCount,
      subscriptionCount: profile.metadata.youtube_stats.subscriptionCount,
      domains,
      fullProfile: profile as any,
    },
    create: {
      agentId,
      likedCount: profile.metadata.youtube_stats.likedCount,
      subscriptionCount: profile.metadata.youtube_stats.subscriptionCount,
      domains,
      fullProfile: profile as any,
    },
  });

  // Store initialization memory
  await prisma.agentMemory.create({
    data: {
      agentId,
      type: "personality_update",
      content: `Agent initialized via YouTube DNA analysis. Archetype: ${profile.agent.name}. Primary domain: ${profile.memory.intellectual_background.primary_domain}. Reasoning style: ${profile.memory.reasoning_style}.`,
      weight: 2.0,
      metadata: {
        source: "yt_dna",
        domains: domains.slice(0, 3).map((d) => d.name),
        traits: profile.personality,
      },
    },
  });
}

/**
 * Get the YT-DNA profile for an agent (if it exists)
 */
export async function getYtDnaProfile(agentId: string) {
  return (prisma as any).ytDnaProfile.findUnique({ where: { agentId } });
}
