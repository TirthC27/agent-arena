use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ArenaError;
use crate::state::{AgentAccount, ArenaAccount, BattleAccount, BattleRecorded};

#[derive(Accounts)]
pub struct RecordBattle<'info> {
    #[account(
        init,
        payer = authority,
        space = BattleAccount::SIZE,
        seeds = [BATTLE_SEED, &arena.total_battles.to_le_bytes()],
        bump
    )]
    pub battle: Account<'info, BattleAccount>,

    #[account(
        mut,
        seeds = [ARENA_SEED],
        bump = arena.bump
    )]
    pub arena: Account<'info, ArenaAccount>,

    #[account(mut)]
    pub agent1: Account<'info, AgentAccount>,

    #[account(mut)]
    pub agent2: Account<'info, AgentAccount>,

    /// Authority must be the arena authority (backend wallet)
    #[account(
        mut,
        constraint = authority.key() == arena.authority @ ArenaError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Record a battle result on-chain. Only callable by the backend authority.
/// This creates an immutable BattleAccount and updates both agents' stats.
///
/// Arguments:
/// - result: 0 = agent1 wins, 1 = agent2 wins, 2 = draw
/// - category: 0-4 (knowledge, strategy, productivity, prediction, social)
/// - score1: agent1 score (0-100)
/// - score2: agent2 score (0-100)
/// - result_hash: SHA256 of the full battle data stored off-chain
pub fn handler(
    ctx: Context<RecordBattle>,
    result: u8,
    category: u8,
    score1: u8,
    score2: u8,
    result_hash: [u8; 32],
) -> Result<()> {
    // Validate inputs
    require!(result <= 2, ArenaError::InvalidBattleResult);
    require!(score1 <= 100, ArenaError::InvalidScore);
    require!(score2 <= 100, ArenaError::InvalidScore);
    require!(category <= 4, ArenaError::InvalidScore);
    require!(
        ctx.accounts.agent1.key() != ctx.accounts.agent2.key(),
        ArenaError::SameAgent
    );

    let clock = Clock::get()?;
    let arena = &mut ctx.accounts.arena;
    let agent1 = &mut ctx.accounts.agent1;
    let agent2 = &mut ctx.accounts.agent2;
    let battle = &mut ctx.accounts.battle;

    // Determine winner pubkey and XP
    let (winner_key, xp_reward) = match result {
        0 => (agent1.key(), XP_WIN), // agent1 wins
        1 => (agent2.key(), XP_WIN), // agent2 wins
        _ => (Pubkey::default(), XP_DRAW), // draw — use default pubkey as sentinel
    };

    // ===== Update Agent 1 =====
    agent1.battle_count += 1;
    agent1.last_battle_at = clock.unix_timestamp;
    match result {
        0 => {
            // Agent1 wins
            agent1.wins += 1;
            agent1.win_streak += 1;
            let bonus = if agent1.win_streak >= 3 { XP_WIN_STREAK_BONUS } else { 0 };
            agent1.xp += XP_WIN + bonus;
            agent1.reputation = agent1.reputation.saturating_add(REP_WIN as u32).min(REP_MAX);
        }
        1 => {
            // Agent1 loses
            agent1.losses += 1;
            agent1.win_streak = 0;
            agent1.xp += XP_LOSS;
            agent1.reputation = agent1.reputation.saturating_sub((-REP_LOSS) as u32);
        }
        _ => {
            // Draw
            agent1.draws += 1;
            agent1.win_streak = 0;
            agent1.xp += XP_DRAW;
            // Reputation unchanged for draws
        }
    }

    // ===== Update Agent 2 =====
    agent2.battle_count += 1;
    agent2.last_battle_at = clock.unix_timestamp;
    match result {
        1 => {
            // Agent2 wins
            agent2.wins += 1;
            agent2.win_streak += 1;
            let bonus = if agent2.win_streak >= 3 { XP_WIN_STREAK_BONUS } else { 0 };
            agent2.xp += XP_WIN + bonus;
            agent2.reputation = agent2.reputation.saturating_add(REP_WIN as u32).min(REP_MAX);
        }
        0 => {
            // Agent2 loses
            agent2.losses += 1;
            agent2.win_streak = 0;
            agent2.xp += XP_LOSS;
            agent2.reputation = agent2.reputation.saturating_sub((-REP_LOSS) as u32);
        }
        _ => {
            // Draw
            agent2.draws += 1;
            agent2.win_streak = 0;
            agent2.xp += XP_DRAW;
        }
    }

    // ===== Create Battle Record =====
    battle.battle_id = arena.total_battles;
    battle.agent1 = agent1.key();
    battle.agent2 = agent2.key();
    battle.winner = winner_key;
    battle.category = category;
    battle.score1 = score1;
    battle.score2 = score2;
    battle.result_hash = result_hash;
    battle.xp_reward = xp_reward;
    battle.timestamp = clock.unix_timestamp;
    battle.bump = ctx.bumps.battle;

    // Increment global battle counter
    arena.total_battles += 1;

    // Emit event
    emit!(BattleRecorded {
        battle_id: battle.battle_id,
        agent1: battle.agent1,
        agent2: battle.agent2,
        winner: battle.winner,
        category,
        score1,
        score2,
        xp_reward,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Battle #{} recorded: score {}−{} | winner: {}",
        battle.battle_id,
        score1,
        score2,
        winner_key
    );
    Ok(())
}
