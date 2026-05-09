use anchor_lang::prelude::*;

// ========== PDA Seeds ==========
#[constant]
pub const ARENA_SEED: &[u8] = b"arena";
#[constant]
pub const AGENT_SEED: &[u8] = b"agent";
#[constant]
pub const BATTLE_SEED: &[u8] = b"battle";

// ========== Agent Limits ==========
pub const MAX_AGENT_NAME_LEN: usize = 32;

// ========== XP Rewards ==========
pub const XP_WIN: u64 = 100;
pub const XP_LOSS: u64 = 25;
pub const XP_DRAW: u64 = 50;
pub const XP_WIN_STREAK_BONUS: u64 = 50; // Extra XP at 3+ streak

// ========== Reputation Changes ==========
pub const REP_WIN: i32 = 50;
pub const REP_LOSS: i32 = -25;
pub const REP_DRAW: i32 = 0;
pub const REP_BASE: u32 = 5000; // Starting reputation (50.00)
pub const REP_MAX: u32 = 10000; // Max reputation (100.00)
