use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaError {
    #[msg("Agent name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Agent name cannot be empty")]
    NameEmpty,

    #[msg("Unauthorized: only the arena authority can perform this action")]
    Unauthorized,

    #[msg("Invalid battle result: must be 0 (agent1 wins), 1 (agent2 wins), or 2 (draw)")]
    InvalidBattleResult,

    #[msg("Score must be between 0 and 100")]
    InvalidScore,

    #[msg("Agent1 and Agent2 cannot be the same")]
    SameAgent,

    #[msg("Reputation overflow")]
    ReputationOverflow,
}
