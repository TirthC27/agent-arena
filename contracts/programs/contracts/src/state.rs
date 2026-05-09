use anchor_lang::prelude::*;

use crate::constants::*;

// ========== Arena (Global Singleton) ==========
#[account]
pub struct ArenaAccount {
    /// The backend authority wallet that can record battles
    pub authority: Pubkey,
    /// Sequential counter for battle IDs
    pub total_battles: u64,
    /// Total agents registered
    pub total_agents: u64,
    /// PDA bump
    pub bump: u8,
}

impl ArenaAccount {
    pub const SIZE: usize = 8  // discriminator
        + 32  // authority
        + 8   // total_battles
        + 8   // total_agents
        + 1;  // bump
}

// ========== Agent Account ==========
#[account]
pub struct AgentAccount {
    /// Wallet that owns this agent
    pub owner: Pubkey,
    /// Agent name (max 32 chars)
    pub name: String,
    /// Total experience points
    pub xp: u64,
    /// Total wins
    pub wins: u32,
    /// Total losses
    pub losses: u32,
    /// Total draws
    pub draws: u32,
    /// Reputation score (0-10000, divide by 100 for display)
    pub reputation: u32,
    /// Total battles fought
    pub battle_count: u32,
    /// Current win streak
    pub win_streak: u32,
    /// Timestamp of creation
    pub created_at: i64,
    /// Timestamp of last battle
    pub last_battle_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl AgentAccount {
    pub const SIZE: usize = 8  // discriminator
        + 32  // owner
        + (4 + MAX_AGENT_NAME_LEN) // name (length prefix + max chars)
        + 8   // xp
        + 4   // wins
        + 4   // losses
        + 4   // draws
        + 4   // reputation
        + 4   // battle_count
        + 4   // win_streak
        + 8   // created_at
        + 8   // last_battle_at
        + 1;  // bump
}

// ========== Battle Account ==========
#[account]
pub struct BattleAccount {
    /// Sequential battle ID
    pub battle_id: u64,
    /// PDA of agent 1
    pub agent1: Pubkey,
    /// PDA of agent 2
    pub agent2: Pubkey,
    /// PDA of the winner (system program pubkey for draws)
    pub winner: Pubkey,
    /// Battle category (0=knowledge, 1=strategy, 2=productivity, 3=prediction, 4=social)
    pub category: u8,
    /// Agent 1 score (0-100)
    pub score1: u8,
    /// Agent 2 score (0-100)
    pub score2: u8,
    /// SHA256 hash of the full off-chain battle data for verifiability
    pub result_hash: [u8; 32],
    /// XP rewarded to the winner (or both in draw)
    pub xp_reward: u64,
    /// Timestamp of the battle
    pub timestamp: i64,
    /// PDA bump
    pub bump: u8,
}

impl BattleAccount {
    pub const SIZE: usize = 8  // discriminator
        + 8   // battle_id
        + 32  // agent1
        + 32  // agent2
        + 32  // winner
        + 1   // category
        + 1   // score1
        + 1   // score2
        + 32  // result_hash
        + 8   // xp_reward
        + 8   // timestamp
        + 1;  // bump
}

// ========== Events ==========

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct BattleRecorded {
    pub battle_id: u64,
    pub agent1: Pubkey,
    pub agent2: Pubkey,
    pub winner: Pubkey,
    pub category: u8,
    pub score1: u8,
    pub score2: u8,
    pub xp_reward: u64,
    pub timestamp: i64,
}
