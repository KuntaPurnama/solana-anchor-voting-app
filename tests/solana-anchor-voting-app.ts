import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { SolanaAnchorVotingApp } from "../target/types/solana_anchor_voting_app";
import { assert, expect } from "chai";
import { PublicKey, LAMPORTS_PER_SOL} from '@solana/web3.js';


describe("solana-anchor-voting-app", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SolanaAnchorVotingApp as Program<SolanaAnchorVotingApp>;
  const programPair = anchor.web3.Keypair.generate();
  const programPair2 = anchor.web3.Keypair.generate();
  const signer = program.provider as anchor.AnchorProvider;
  const REGISTER_CANDIDATE = Buffer.from("register_candidate")

  function getProgramInteraction(): { user: anchor.web3.Keypair, program: Program<SolanaAnchorVotingApp>, provider: anchor.Provider } {
    const user = anchor.web3.Keypair.generate();
    const provider = new anchor.AnchorProvider(anchor.AnchorProvider.local().connection, new anchor.Wallet(user), {});
    const programRep = new anchor.Program(program.idl as anchor.Idl, program.programId, provider) as Program<SolanaAnchorVotingApp>
    return {user: user, program: programRep, provider: provider};
  }

  async function addFunds(user: anchor.web3.Keypair, amount: number, provider: anchor.Provider) {
    const airdrop_tx = await provider.connection.requestAirdrop(user.publicKey, amount)
    await provider.connection.confirmTransaction(airdrop_tx);
  }

  const {user: userPrabowo, program: programPrabowo, provider: providerPrabowo} = getProgramInteraction();
  
  
  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize(2)
    .accounts({
      electionData: programPair.publicKey
    })
    .signers([programPair])
    .rpc()
    const election = await program.account.electionData.fetch(programPair.publicKey)
    assert.equal(2, election.candidateThreshold)
    assert.equal(signer.publicKey.toBase58, election.initiator.toBase58)
    assert.equal("registerPhase",  Object.keys(election.phase)[0].toString())
  });

  it("Is initialized Error", async () => {
    // Add your test here.
    try{
      await program.methods.initialize(0)
      .accounts({
        electionData: programPair2.publicKey
      })
      .signers([programPair2])
      .rpc()
    }catch(e){
      assert.isTrue(e instanceof AnchorError);
      assert.equal("CandidateThresholdShouldBeGreaterThanZero", e.error.errorMessage)
    }
  });

  it("Is Registered success", async () => {
    // Add your test here.
    const election = await program.account.electionData.fetch(programPair.publicKey)
    const [registerPda, _] = PublicKey
    .findProgramAddressSync([REGISTER_CANDIDATE, programPair.publicKey.toBuffer(), signer.wallet.publicKey.toBuffer(), Buffer.from([election.totalCandidate])], program.programId)

    await program.methods.register("Jokowi")
    .accounts({
      electionData: programPair.publicKey,
      candidateData: registerPda
    })
    .rpc()

    const candidateData = await program.account.candidateData.fetch(registerPda)
    assert.equal(candidateData.id, 1)
    assert.equal(candidateData.name, "Jokowi")
    assert.equal(candidateData.signer.toBase58, signer.wallet.publicKey.toBase58)
    assert.equal(candidateData.totalVotes.toString(), "0")


    //=============================================================== Register candidate number 2  =======================================
    await addFunds(userPrabowo,LAMPORTS_PER_SOL,providerPrabowo);
    const election2 = await program.account.electionData.fetch(programPair.publicKey)
    const [registerPda2, bump] = PublicKey
    .findProgramAddressSync([REGISTER_CANDIDATE, programPair.publicKey.toBuffer(), userPrabowo.publicKey.toBuffer(), Buffer.from([election2.totalCandidate])], program.programId)

    await programPrabowo.methods.register("Prabowo")
    .accounts({
      electionData: programPair.publicKey,
      candidateData: registerPda2
    })
    .rpc()

    const candidateData2 = await program.account.candidateData.fetch(registerPda2)
    assert.equal(candidateData2.id, 2)
    assert.equal(candidateData2.name, "Prabowo")
    assert.equal(candidateData2.signer.toBase58, userPrabowo.publicKey.toBase58)
    assert.equal(candidateData2.totalVotes.toString(), "0")
  });

  it("Is Registered Error Candidate Threshold Reached", async () => {
    // Add your test here.
    try{
      const election = await program.account.electionData.fetch(programPair.publicKey)
      const {user: user2, program: program2, provider: provider2} = getProgramInteraction();
      await addFunds(user2,LAMPORTS_PER_SOL,provider2);

      const [registerPda2, bump] = PublicKey
      .findProgramAddressSync([REGISTER_CANDIDATE, programPair.publicKey.toBuffer(), user2.publicKey.toBuffer(), Buffer.from([election.totalCandidate])], program.programId)

      await program2.methods.register("Anies")
      .accounts({
        electionData: programPair.publicKey,
        candidateData: registerPda2
      })
    .rpc()
    }catch(e){
      assert.isTrue(e instanceof AnchorError);
      assert.equal("CandidateIsFull", e.error.errorMessage)
    }
  });

  it("Is Vote Error Voting Phase Is Closed", async () => {
    // const election = await program.account.electionData.fetch(programPair.publicKey)
    const [candidatePda, bump] = PublicKey
    .findProgramAddressSync([REGISTER_CANDIDATE, programPair.publicKey.toBuffer(), userPrabowo.publicKey.toBuffer(), Buffer.from([2])], program.programId)
    const [voter, _] = PublicKey.findProgramAddressSync([signer.wallet.publicKey.toBuffer()], program.programId)
    try{
      await program.methods.vote()
      .accounts({
        voter: voter,
        candidateData: candidatePda,
        electionData: programPair.publicKey
      })
      .rpc()
    }catch(e){
      assert.isTrue(e instanceof AnchorError);
      assert.equal("VotingPhaseIsClosed", e.error.errorMessage)
    }
  });

  it("Is Change Phase Error Not Authorized", async () => {
    try{
      const {user: user2, program: program2, provider: provider2} = getProgramInteraction();
      await addFunds(user2,LAMPORTS_PER_SOL,provider2);
    
      await program2.methods.changePhase({votingOpenPhase: {}})
      .accounts({
        electionData: programPair.publicKey,
      })
      .rpc()
    }catch(e){
      assert.isTrue(e instanceof AnchorError);
      assert.equal("Unauthorized", e.error.errorMessage)
    }
  });

  it("Is Change Phase", async () => {
    // Add your test here.
    await program.methods.changePhase({votingOpenPhase: {}})
    .accounts({
      electionData: programPair.publicKey,
    })
    .rpc()

    const electionData = await program.account.electionData.fetch(programPair.publicKey)
    assert.equal("votingOpenPhase",  Object.keys(electionData.phase)[0].toString())
  });

  it("Is Change Phase Error Not Authorized", async () => {
    try{
      const {user: user2, program: program2, provider: provider2} = getProgramInteraction();
      await addFunds(user2,LAMPORTS_PER_SOL,provider2);
    
      await program2.methods.changePhase({votingOpenPhase: {}})
      .accounts({
        electionData: programPair.publicKey,
      })
      .rpc()
    }catch(e){
      assert.isTrue(e instanceof AnchorError);
      assert.equal("Unauthorized", e.error.errorMessage)
    }
  });

  it("Is Vote Success", async () => {
    // const election = await program.account.electionData.fetch(programPair.publicKey)
    const [candidatePda, bump] = PublicKey
    .findProgramAddressSync([REGISTER_CANDIDATE, programPair.publicKey.toBuffer(), userPrabowo.publicKey.toBuffer(), Buffer.from([2])], program.programId)
    const [voter, _] = PublicKey.findProgramAddressSync([signer.wallet.publicKey.toBuffer()], program.programId)
    await program.methods.vote()
      .accounts({
        voter: voter,
        candidateData: candidatePda,
        electionData: programPair.publicKey
      })
      .rpc()
     
    const candidateData = await program.account.candidateData.fetch(candidatePda)
    const voterData = await program.account.voter.fetch(voter)
    
    assert.equal("Prabowo", candidateData.name)
    assert.equal("1", candidateData.totalVotes.toString())

    assert.equal(2, voterData.selectedCandidateId)
    assert.equal(signer.wallet.publicKey.toBase58, voterData.voter.toBase58)
  });

  it("Is Registered Phased Closed Error", async () => {
    // Add your test here.
    try{
      const election = await program.account.electionData.fetch(programPair.publicKey)
      const {user: user2, program: program2, provider: provider2} = getProgramInteraction();
      await addFunds(user2,LAMPORTS_PER_SOL,provider2);

      const [registerPda2, bump] = PublicKey
      .findProgramAddressSync([REGISTER_CANDIDATE, programPair.publicKey.toBuffer(), user2.publicKey.toBuffer(), Buffer.from([election.totalCandidate])], program.programId)

      await program2.methods.register("Anies")
      .accounts({
        electionData: programPair.publicKey,
        candidateData: registerPda2
      })
    .rpc()
    }catch(e){
      assert.isTrue(e instanceof AnchorError);
      assert.equal("RegisterPhaseIsClosed", e.error.errorMessage)
    }
  });
});
