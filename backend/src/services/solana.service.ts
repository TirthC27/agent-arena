import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { createHash } from "crypto";
import { env } from "../config/env";
import path from "path";
import fs from "fs";

// ========== Constants (must match Rust program) ==========
const ARENA_SEED = Buffer.from("arena");
const AGENT_SEED = Buffer.from("agent");
const BATTLE_SEED = Buffer.from("battle");

const PROGRAM_ID = new PublicKey(env.ANCHOR_PROGRAM_ID);

// ========== Category Mapping ==========
const CATEGORY_MAP: Record<string, number> = {
  knowledge: 0,
  strategy: 1,
  productivity: 2,
  prediction: 3,
  social: 4,
};

// ========== Connection & Authority ==========

let connection: Connection;
let authorityKeypair: Keypair | null = null;
let anchorProgram: anchor.Program | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  }
  return connection;
}

function getAuthority(): Keypair | null {
  if (authorityKeypair) return authorityKeypair;

  try {
    const raw = env.SOLANA_AUTHORITY_KEYPAIR;
    if (!raw || raw === "[]" || raw === "") {
      console.warn("[SOLANA] No authority keypair configured — on-chain features disabled");
      return null;
    }
    const secretKey = Uint8Array.from(JSON.parse(raw));
    if (secretKey.length !== 64) {
      console.warn("[SOLANA] Invalid authority keypair length — on-chain features disabled");
      return null;
    }
    authorityKeypair = Keypair.fromSecretKey(secretKey);
    return authorityKeypair;
  } catch (err: any) {
    console.warn("[SOLANA] Failed to parse authority keypair:", err.message);
    return null;
  }
}

/**
 * Get or initialize the Anchor Program instance using the IDL.
 */
function getProgram(): anchor.Program | null {
  if (anchorProgram) return anchorProgram;

  const authority = getAuthority();
  if (!authority) return null;

  try {
    const conn = getConnection();

    // Try to load IDL from contracts/target/idl/contracts.json
    const idlPaths = [
      path.resolve(__dirname, "../../../../contracts/target/idl/contracts.json"),
      path.resolve(__dirname, "../../../contracts/target/idl/contracts.json"),
      path.resolve(__dirname, "../../idl/contracts.json"),
    ];

    let idl: any = null;
    for (const p of idlPaths) {
      try {
        if (fs.existsSync(p)) {
          idl = JSON.parse(fs.readFileSync(p, "utf-8"));
          console.log(`[SOLANA] Loaded IDL from: ${p}`);
          break;
        }
      } catch { /* try next */ }
    }

    if (!idl) {
      console.warn("[SOLANA] IDL file not found — using manual instructions");
      return null;
    }

    const provider = new anchor.AnchorProvider(
      conn,
      new anchor.Wallet(authority),
      { commitment: "confirmed" }
    );

    anchorProgram = new anchor.Program(idl as anchor.Idl, provider);
    console.log("[SOLANA] Anchor program initialized successfully");
    return anchorProgram;
  } catch (err: any) {
    console.error("[SOLANA] Failed to initialize Anchor program:", err.message);
    return null;
  }
}

// ========== PDA Derivation ==========

export function deriveArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ARENA_SEED], PROGRAM_ID);
}

export function deriveAgentPDA(
  ownerWallet: PublicKey,
  agentName: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [AGENT_SEED, ownerWallet.toBuffer(), Buffer.from(agentName)],
    PROGRAM_ID
  );
}

export function deriveBattlePDA(battleId: number): [PublicKey, number] {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(BigInt(battleId));
  return PublicKey.findProgramAddressSync(
    [BATTLE_SEED, idBuffer],
    PROGRAM_ID
  );
}

// ========== Hash Utility ==========

/**
 * Generate a SHA256 hash of battle data for on-chain verifiability.
 * The full data is stored off-chain; the hash proves integrity.
 */
export function hashBattleData(data: {
  prompt: string;
  agent1Response: string;
  agent2Response: string;
  judgement: string;
}): number[] {
  const raw = JSON.stringify(data);
  const hash = createHash("sha256").update(raw).digest();
  return Array.from(hash);
}

// ========== On-Chain Read Operations ==========

/**
 * Fetch the global Arena account data using IDL-based decoding
 */
export async function getArenaAccount() {
  const conn = getConnection();
  const [arenaPDA] = deriveArenaPDA();

  const program = getProgram();
  if (program) {
    try {
      const arena = await (program.account as any).arenaAccount.fetch(arenaPDA);
      return {
        address: arenaPDA.toBase58(),
        exists: true,
        authority: arena.authority.toBase58(),
        totalBattles: Number(arena.totalBattles),
        totalAgents: Number(arena.totalAgents),
      };
    } catch {
      // Account may not exist yet
      return null;
    }
  }

  // Fallback: check if account exists
  const accountInfo = await conn.getAccountInfo(arenaPDA);
  if (!accountInfo) return null;

  return {
    address: arenaPDA.toBase58(),
    exists: true,
    dataLength: accountInfo.data.length,
  };
}

/**
 * Fetch an agent's on-chain data
 */
export async function getAgentOnChain(ownerWallet: string, agentName: string) {
  const conn = getConnection();
  const ownerPubkey = new PublicKey(ownerWallet);
  const [agentPDA] = deriveAgentPDA(ownerPubkey, agentName);

  const program = getProgram();
  if (program) {
    try {
      const agent = await (program.account as any).agentAccount.fetch(agentPDA);
      return {
        address: agentPDA.toBase58(),
        exists: true,
        owner: agent.owner.toBase58(),
        name: agent.name,
        xp: Number(agent.xp),
        wins: agent.wins,
        losses: agent.losses,
        draws: agent.draws,
        reputation: agent.reputation,
        battleCount: agent.battleCount,
      };
    } catch {
      return null;
    }
  }

  const accountInfo = await conn.getAccountInfo(agentPDA);
  if (!accountInfo) return null;

  return {
    address: agentPDA.toBase58(),
    exists: true,
    dataLength: accountInfo.data.length,
  };
}

// ========== On-Chain Write Operations (Backend Authority) ==========

/**
 * Record a battle result on-chain via the Anchor program.
 * Called by the backend after AI battle judging completes.
 *
 * This creates an immutable BattleAccount and updates both agents' stats
 * in a single atomic transaction signed by the backend authority.
 */
export async function recordBattleOnChain(params: {
  agent1Wallet: string;
  agent1Name: string;
  agent2Wallet: string;
  agent2Name: string;
  result: "agent1" | "agent2" | "draw";
  category: string;
  score1: number;
  score2: number;
  battleData: {
    prompt: string;
    agent1Response: string;
    agent2Response: string;
    judgement: string;
  };
}) {
  const program = getProgram();
  const authority = getAuthority();

  if (!program || !authority) {
    console.warn("[SOLANA] Anchor program or authority not available — skipping on-chain recording");
    return null;
  }

  const conn = getConnection();
  const [arenaPDA] = deriveArenaPDA();

  // Derive agent PDAs using actual wallet addresses
  let agent1Pubkey: PublicKey;
  let agent2Pubkey: PublicKey;
  try {
    agent1Pubkey = new PublicKey(params.agent1Wallet);
    agent2Pubkey = new PublicKey(params.agent2Wallet);
  } catch (err: any) {
    console.error("[SOLANA] Invalid wallet address for PDA derivation:", err.message);
    return null;
  }

  const [agent1PDA] = deriveAgentPDA(agent1Pubkey, params.agent1Name);
  const [agent2PDA] = deriveAgentPDA(agent2Pubkey, params.agent2Name);

  // Verify agent accounts exist on-chain before attempting tx
  const [agent1Info, agent2Info] = await Promise.all([
    conn.getAccountInfo(agent1PDA),
    conn.getAccountInfo(agent2PDA),
  ]);

  if (!agent1Info || !agent2Info) {
    console.warn(
      `[SOLANA] Agent account(s) not found on-chain — agent1: ${!!agent1Info}, agent2: ${!!agent2Info}. Skipping.`
    );
    return null;
  }

  // Map result to u8
  const resultCode =
    params.result === "agent1" ? 0 : params.result === "agent2" ? 1 : 2;

  // Map category to u8
  const categoryCode = CATEGORY_MAP[params.category] ?? 0;

  // Clamp scores to 0-100 for u8
  const score1 = Math.min(100, Math.max(0, Math.round(params.score1)));
  const score2 = Math.min(100, Math.max(0, Math.round(params.score2)));

  // Hash the full battle data
  const resultHash = hashBattleData(params.battleData);

  try {
    console.log(`[SOLANA] Recording battle on-chain...`);
    console.log(`  Arena: ${arenaPDA.toBase58()}`);
    console.log(`  Agent1: ${agent1PDA.toBase58()}`);
    console.log(`  Agent2: ${agent2PDA.toBase58()}`);
    console.log(`  Result: ${params.result} (code: ${resultCode})`);

    // Send the real Anchor transaction
    const txSignature = await program.methods
      .recordBattle(resultCode, categoryCode, score1, score2, resultHash)
      .accounts({
        arena: arenaPDA,
        agent1: agent1PDA,
        agent2: agent2PDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log(`[SOLANA] Battle recorded on-chain! Tx: ${txSignature}`);

    // Read the updated arena to get the battle PDA
    const arenaData = await (program.account as any).arenaAccount.fetch(arenaPDA);
    const battleIndex = Number(arenaData.totalBattles) - 1;
    const [battlePDA] = deriveBattlePDA(battleIndex);

    return {
      success: true,
      battlePDA: battlePDA.toBase58(),
      arenaPDA: arenaPDA.toBase58(),
      agent1PDA: agent1PDA.toBase58(),
      agent2PDA: agent2PDA.toBase58(),
      txSignature,
    };
  } catch (error: any) {
    console.error("[SOLANA] Failed to record battle on-chain:", error.message);
    if (error.logs) {
      console.error("[SOLANA] Program logs:", error.logs);
    }
    // Graceful degradation — battle still saved in DB even if on-chain fails
    return null;
  }
}

/**
 * Get the Solana Explorer URL for a transaction or account
 */
export function getExplorerUrl(
  addressOrSignature: string,
  type: "tx" | "address" = "address"
): string {
  const cluster = env.SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet-beta";
  return `https://explorer.solana.com/${type}/${addressOrSignature}?cluster=${cluster}`;
}

/**
 * Check if the Solana connection and arena are set up.
 * Safe to call even without a valid authority keypair.
 */
export async function checkSolanaHealth() {
  try {
    const conn = getConnection();
    const slot = await conn.getSlot();
    const [arenaPDA] = deriveArenaPDA();
    const arenaInfo = await conn.getAccountInfo(arenaPDA);
    const authority = getAuthority();

    return {
      connected: true,
      slot,
      arenaInitialized: !!arenaInfo,
      arenaAddress: arenaPDA.toBase58(),
      authorityConfigured: !!authority,
      authorityAddress: authority?.publicKey.toBase58() ?? null,
      anchorProgramLoaded: !!getProgram(),
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message,
      authorityConfigured: false,
      anchorProgramLoaded: false,
    };
  }
}
