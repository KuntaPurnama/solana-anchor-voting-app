use anchor_lang::prelude::*;

declare_id!("5tRMSZ8NtULmJPutb9GcuStkXJU82e3BfnycjD4cPad5");

#[program]
pub mod solana_anchor_voting_app {
    use super::*;

    pub fn initialize(ctx: Context<CreateElection>, candidate_threshold: u8) -> Result<()> {
        require!(candidate_threshold > 0, ElectionError::CandidateThresholdShouldBeGreaterThanZero);

        let election_data = &mut ctx.accounts.election_data;
        let signer = &ctx.accounts.signer;

        election_data.phase = ElectionPhase::RegisterPhase;
        election_data.initiator = *signer.key;
        election_data.total_candidate = 1;
        election_data.candidate_threshold = candidate_threshold;
        election_data.phase = ElectionPhase::RegisterPhase;

        Ok(())
    }

    pub fn register(ctx: Context<RegisterCandidate>, name: String) -> Result<()> {
        let election_data = &mut ctx.accounts.election_data;

        require!(election_data.phase == ElectionPhase::RegisterPhase, ElectionError::RegisterPhaseIsClosed);
        require!(election_data.total_candidate <= election_data.total_candidate, ElectionError::CandidateIsFull);

        let candidate_data = &mut ctx.accounts.candidate_data;
        let signer = &ctx.accounts.signer;

        candidate_data.id = election_data.total_candidate;
        candidate_data.name = name;
        candidate_data.signer = *signer.key;

        election_data.total_candidate += 1;

        Ok(())
    }

    pub fn vote(ctx: Context<VoteCandidate>) -> Result<()> {
        let election_data = &mut ctx.accounts.election_data;
        require!(election_data.phase == ElectionPhase::VotingOpenPhase, ElectionError::VotingPhaseIsClosed);

        let candidate_data = &mut ctx.accounts.candidate_data;
        let voter = &mut ctx.accounts.voter;
        let signer = &ctx.accounts.signer;

        candidate_data.total_votes += 1;
        voter.selected_candidate_id = candidate_data.id;
        voter.voter = *signer.key;
        
        Ok(())
    }

    pub fn change_phase(ctx: Context<ChangeElectionPhase>, phase: ElectionPhase) -> Result<()> {
        let election_data = &mut ctx.accounts.election_data;
        election_data.phase = phase;
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(total_candidate: u8)]
pub struct CreateElection<'info> {
    #[account(
        init, 
        payer = signer,
        space = 8 + 1 + 1 + 32 + 8 + 2
    )]
    pub election_data : Account<'info, ElectionData>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program : Program<'info, System>
}

#[derive(Accounts)]
pub struct ChangeElectionPhase<'info> {
    #[account(mut)]
    pub election_data: Account<'info, ElectionData>,
    #[account(mut, address = election_data.initiator @ ElectionError::Unauthorized)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterCandidate<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + 8 + 32 + 4 + 100*4,
        seeds = [b"register_candidate", election_data.key().as_ref(), signer.key().as_ref(), &[election_data.total_candidate as u8].as_ref()],
        bump
    )]
    pub candidate_data: Account<'info, CandidateData>,
    #[account(mut)]
    pub election_data : Account<'info, ElectionData>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program : Program<'info, System>
}

#[derive(Accounts)]
pub struct VoteCandidate<'info> {
    #[account(
        init, 
        payer = signer,
        space = 8 + 8 + 32,
        seeds = [signer.key().as_ref()],
        bump
    )]
    pub voter: Account<'info, Voter>,
    #[account(mut)]
    pub candidate_data: Account<'info, CandidateData>,
    #[account(mut)]
    pub election_data : Account<'info, ElectionData>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program : Program<'info, System>
}

#[account]
pub struct Voter{
    pub selected_candidate_id: u8,
    pub voter: Pubkey
}


#[account]
pub struct ElectionData {
    pub total_candidate: u8,
    pub candidate_threshold: u8,
    pub initiator: Pubkey,
    pub phase: ElectionPhase,
}

#[account]
pub struct CandidateData {
    pub id: u8,
    pub signer: Pubkey,
    pub name: String,
    pub total_votes: u64
}

#[derive(AnchorDeserialize,AnchorSerialize,PartialEq,Eq,Clone)]
pub enum ElectionPhase {
    RegisterPhase,
    VotingOpenPhase,
    VotingClosePhase
}

#[error_code]
pub enum ElectionError{
    CandidateThresholdShouldBeGreaterThanZero,
    CandidateIsFull,
    RegisterPhaseIsClosed,
    VotingPhaseIsClosed,
    Unauthorized
}
