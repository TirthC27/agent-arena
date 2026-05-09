use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ArenaError;
use crate::state::{AgentAccount, AgentRegistered, ArenaAccount};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = AgentAccount::SIZE,
        seeds = [AGENT_SEED, owner.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub agent: Account<'info, AgentAccount>,

    #[account(
        mut,
        seeds = [ARENA_SEED],
        bump = arena.bump
    )]
    pub arena: Account<'info, ArenaAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Register a new agent on-chain. The user signs this transaction via Phantom.
/// This proves wallet ownership of the agent.
pub fn handler(ctx: Context<RegisterAgent>, name: String) -> Result<()> {
    // Validate name
    require!(!name.is_empty(), ArenaError::NameEmpty);
    require!(name.len() <= MAX_AGENT_NAME_LEN, ArenaError::NameTooLong);

    let clock = Clock::get()?;
    let agent = &mut ctx.accounts.agent;
    let arena = &mut ctx.accounts.arena;

    // Initialize agent
    agent.owner = ctx.accounts.owner.key();
    agent.name = name.clone();
    agent.xp = 0;
    agent.wins = 0;
    agent.losses = 0;
    agent.draws = 0;
    agent.reputation = REP_BASE;
    agent.battle_count = 0;
    agent.win_streak = 0;
    agent.created_at = clock.unix_timestamp;
    agent.last_battle_at = 0;
    agent.bump = ctx.bumps.agent;

    // Update global counter
    arena.total_agents += 1;

    // Emit event
    emit!(AgentRegistered {
        agent: agent.key(),
        owner: agent.owner,
        name,
        timestamp: clock.unix_timestamp,
    });

    msg!("Agent registered: {} (total: {})", agent.name, arena.total_agents);
    Ok(())
}
