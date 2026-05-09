use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::ArenaAccount;

#[derive(Accounts)]
pub struct InitializeArena<'info> {
    #[account(
        init,
        payer = authority,
        space = ArenaAccount::SIZE,
        seeds = [ARENA_SEED],
        bump
    )]
    pub arena: Account<'info, ArenaAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// One-time initialization of the global Arena state.
/// Called once after deployment by the authority wallet.
pub fn handler(ctx: Context<InitializeArena>) -> Result<()> {
    let arena = &mut ctx.accounts.arena;
    arena.authority = ctx.accounts.authority.key();
    arena.total_battles = 0;
    arena.total_agents = 0;
    arena.bump = ctx.bumps.arena;

    msg!("Arena initialized! Authority: {}", arena.authority);
    Ok(())
}
