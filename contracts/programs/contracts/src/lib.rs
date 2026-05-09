#![allow(ambiguous_glob_reexports)]

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("AjEeXL7uxDbPp3EebeUH9g8uE59E66NHWuwYFUfS1n2L");

#[program]
pub mod contracts {
    use super::*;

    /// Initialize the global Arena state. Called once after deployment.
    pub fn initialize_arena(ctx: Context<InitializeArena>) -> Result<()> {
        instructions::initialize_arena::handler(ctx)
    }

    /// Register a new agent on-chain. User signs via Phantom wallet.
    pub fn register_agent(ctx: Context<RegisterAgent>, name: String) -> Result<()> {
        instructions::register_agent::handler(ctx, name)
    }

    /// Record a battle result on-chain. Only callable by backend authority.
    /// result: 0=agent1 wins, 1=agent2 wins, 2=draw
    /// category: 0=knowledge, 1=strategy, 2=productivity, 3=prediction, 4=social
    pub fn record_battle(
        ctx: Context<RecordBattle>,
        result: u8,
        category: u8,
        score1: u8,
        score2: u8,
        result_hash: [u8; 32],
    ) -> Result<()> {
        instructions::record_battle::handler(ctx, result, category, score1, score2, result_hash)
    }

    /// Update an agent's reputation. Only callable by backend authority.
    pub fn update_reputation(ctx: Context<UpdateReputation>, new_reputation: u32) -> Result<()> {
        instructions::update_reputation::handler(ctx, new_reputation)
    }
}
