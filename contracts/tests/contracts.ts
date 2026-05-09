import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Contracts } from "../target/types/contracts";
import { expect } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";

describe("Agent Arena", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.contracts as Program<Contracts>;
  const authority = provider.wallet;

  // PDA seeds (must match Rust constants)
  const ARENA_SEED = Buffer.from("arena");
  const AGENT_SEED = Buffer.from("agent");
  const BATTLE_SEED = Buffer.from("battle");

  // Derive PDAs
  const [arenaPDA] = PublicKey.findProgramAddressSync(
    [ARENA_SEED],
    program.programId
  );

  const agentName = "TestAgent";
  const [agentPDA] = PublicKey.findProgramAddressSync(
    [AGENT_SEED, authority.publicKey.toBuffer(), Buffer.from(agentName)],
    program.programId
  );

  // Second agent for battle testing
  const agent2Name = "Rival";
  const [agent2PDA] = PublicKey.findProgramAddressSync(
    [AGENT_SEED, authority.publicKey.toBuffer(), Buffer.from(agent2Name)],
    program.programId
  );

  it("Initializes the Arena", async () => {
    const tx = await program.methods
      .initializeArena()
      .accounts({
        arena: arenaPDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  Initialize Arena tx:", tx);

    const arena = await program.account.arenaAccount.fetch(arenaPDA);
    expect(arena.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(arena.totalBattles.toNumber()).to.equal(0);
    expect(arena.totalAgents.toNumber()).to.equal(0);
    console.log("  ✅ Arena initialized with authority:", arena.authority.toBase58());
  });

  it("Registers an agent", async () => {
    const tx = await program.methods
      .registerAgent(agentName)
      .accounts({
        agent: agentPDA,
        arena: arenaPDA,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  Register Agent tx:", tx);

    const agent = await program.account.agentAccount.fetch(agentPDA);
    expect(agent.owner.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(agent.name).to.equal(agentName);
    expect(agent.xp.toNumber()).to.equal(0);
    expect(agent.wins).to.equal(0);
    expect(agent.reputation).to.equal(5000); // REP_BASE
    console.log("  ✅ Agent registered:", agent.name, "| Rep:", agent.reputation);

    // Verify arena counter updated
    const arena = await program.account.arenaAccount.fetch(arenaPDA);
    expect(arena.totalAgents.toNumber()).to.equal(1);
  });

  it("Registers a second agent", async () => {
    const tx = await program.methods
      .registerAgent(agent2Name)
      .accounts({
        agent: agent2PDA,
        arena: arenaPDA,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  Register Agent 2 tx:", tx);

    const agent = await program.account.agentAccount.fetch(agent2PDA);
    expect(agent.name).to.equal(agent2Name);
    console.log("  ✅ Agent 2 registered:", agent.name);

    const arena = await program.account.arenaAccount.fetch(arenaPDA);
    expect(arena.totalAgents.toNumber()).to.equal(2);
  });

  it("Records a battle (agent1 wins)", async () => {
    // Battle PDA uses current total_battles count
    const arena = await program.account.arenaAccount.fetch(arenaPDA);
    const battleId = arena.totalBattles.toNumber();

    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(BigInt(battleId));
    const [battlePDA] = PublicKey.findProgramAddressSync(
      [BATTLE_SEED, idBuffer],
      program.programId
    );

    // Fake result hash (SHA256 of battle data)
    const resultHash = Array.from(Buffer.alloc(32, 0xab));

    const tx = await program.methods
      .recordBattle(
        0,           // result: agent1 wins
        0,           // category: knowledge
        85,          // score1
        72,          // score2
        resultHash   // result_hash
      )
      .accounts({
        battle: battlePDA,
        arena: arenaPDA,
        agent1: agentPDA,
        agent2: agent2PDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  Record Battle tx:", tx);

    // Verify battle record
    const battle = await program.account.battleAccount.fetch(battlePDA);
    expect(battle.battleId.toNumber()).to.equal(0);
    expect(battle.score1).to.equal(85);
    expect(battle.score2).to.equal(72);
    expect(battle.category).to.equal(0);
    expect(battle.agent1.toBase58()).to.equal(agentPDA.toBase58());
    expect(battle.winner.toBase58()).to.equal(agentPDA.toBase58());

    // Verify agent1 stats updated (winner)
    const agent1 = await program.account.agentAccount.fetch(agentPDA);
    expect(agent1.wins).to.equal(1);
    expect(agent1.xp.toNumber()).to.equal(100); // XP_WIN
    expect(agent1.battleCount).to.equal(1);
    expect(agent1.reputation).to.equal(5050); // 5000 + 50

    // Verify agent2 stats updated (loser)
    const agent2 = await program.account.agentAccount.fetch(agent2PDA);
    expect(agent2.losses).to.equal(1);
    expect(agent2.xp.toNumber()).to.equal(25); // XP_LOSS
    expect(agent2.battleCount).to.equal(1);
    expect(agent2.reputation).to.equal(4975); // 5000 - 25

    // Verify arena counter
    const updatedArena = await program.account.arenaAccount.fetch(arenaPDA);
    expect(updatedArena.totalBattles.toNumber()).to.equal(1);

    console.log("  ✅ Battle recorded | Agent1 XP:", agent1.xp.toNumber(), "| Agent2 XP:", agent2.xp.toNumber());
  });

  it("Records a draw battle", async () => {
    const arena = await program.account.arenaAccount.fetch(arenaPDA);
    const battleId = arena.totalBattles.toNumber();
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(BigInt(battleId));
    const [battlePDA] = PublicKey.findProgramAddressSync(
      [BATTLE_SEED, idBuffer],
      program.programId
    );

    const resultHash = Array.from(Buffer.alloc(32, 0xcd));

    const tx = await program.methods
      .recordBattle(2, 1, 78, 80, resultHash) // draw, strategy
      .accounts({
        battle: battlePDA,
        arena: arenaPDA,
        agent1: agentPDA,
        agent2: agent2PDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  Draw Battle tx:", tx);

    const agent1 = await program.account.agentAccount.fetch(agentPDA);
    expect(agent1.draws).to.equal(1);
    expect(agent1.xp.toNumber()).to.equal(150); // 100 (win) + 50 (draw)
    expect(agent1.winStreak).to.equal(0); // Reset on draw

    console.log("  ✅ Draw recorded | Agent1 total XP:", agent1.xp.toNumber());
  });

  it("Updates agent reputation", async () => {
    const tx = await program.methods
      .updateReputation(7500)
      .accounts({
        arena: arenaPDA,
        agent: agentPDA,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("  Update Reputation tx:", tx);

    const agent = await program.account.agentAccount.fetch(agentPDA);
    expect(agent.reputation).to.equal(7500);
    console.log("  ✅ Reputation updated to:", agent.reputation);
  });

  it("Rejects agent name that is too long", async () => {
    const longName = "A".repeat(33);
    const [badPDA] = PublicKey.findProgramAddressSync(
      [AGENT_SEED, authority.publicKey.toBuffer(), Buffer.from(longName)],
      program.programId
    );

    try {
      await program.methods
        .registerAgent(longName)
        .accounts({
          agent: badPDA,
          arena: arenaPDA,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.toString()).to.include("NameTooLong");
      console.log("  ✅ Correctly rejected long name");
    }
  });
});
