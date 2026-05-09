use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ArenaError;
use crate::state::{AgentAccount, ArenaAccount};

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(
        seeds = [ARENA_SEED],
        bump = arena.bump
    )]
    pub arena: Account<'info, ArenaAccount>,

    #[account(mut)]
    pub agent: Account<'info, AgentAccount>,

    /// Authority must be the arena authority (backend wallet)
    #[account(
        constraint = authority.key() == arena.authority @ ArenaError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

/// Update an agent's reputation score. Only callable by the backend authority.
/// Used for periodic reputation recalculations or manual adjustments.
pub fn handler(ctx: Context<UpdateReputation>, new_reputation: u32) -> Result<()> {
    require!(new_reputation <= REP_MAX, ArenaError::ReputationOverflow);

    let agent = &mut ctx.accounts.agent;
    let old_rep = agent.reputation;
    agent.reputation = new_reputation;

    msg!(
        "Reputation updated for {}: {} → {}",
        agent.name,
        old_rep,
        new_reputation
    );
    Ok(())
}
