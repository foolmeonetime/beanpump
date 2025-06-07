// app/api/claims/route.ts - Compatible with older @solana/spl-token
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { 
  Connection, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction 
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contributor = searchParams.get('contributor');
    const takeoverAddress = searchParams.get('takeover');
    
    if (!contributor) {
      return NextResponse.json(
        { success: false, error: 'Contributor address required' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    let query = `
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name,
        t.is_finalized,
        t.is_successful,
        t.custom_reward_rate,
        t.v2_token_mint,
        t.vault,
        t.v1_token_mint
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.contributor = $1
        AND t.is_finalized = true
        AND COALESCE(c.is_claimed, false) = false
    `;
    
    const params = [contributor];
    
    if (takeoverAddress) {
      query += ` AND t.address = $2`;
      params.push(takeoverAddress);
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await client.query(query, params);
    client.release();
    
    const claims = result.rows.map(row => {
      const contributionAmount = BigInt(row.amount);
      const rewardRate = parseFloat(row.custom_reward_rate || 1);
      
      return {
        id: row.id,
        takeoverId: row.takeover_id,
        takeoverAddress: row.takeover_address,
        tokenName: row.token_name,
        contributionAmount: row.amount.toString(),
        isSuccessful: row.is_successful,
        customRewardRate: rewardRate,
        v2TokenMint: row.v2_token_mint,
        vault: row.vault,
        v1TokenMint: row.v1_token_mint,
        transactionSignature: row.transaction_signature,
        createdAt: row.created_at,
        isClaimed: row.is_claimed || false,
        // Calculate claimable amounts
        refundAmount: row.is_successful ? '0' : row.amount.toString(),
        rewardAmount: row.is_successful 
          ? (contributionAmount * BigInt(Math.floor(rewardRate * 1000)) / BigInt(1000)).toString()
          : '0'
      };
    });
    
    return NextResponse.json({
      success: true,
      claims,
      count: claims.length
    });
    
  } catch (error: any) {
    console.error('Error fetching claims:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contributionId,
      contributor,
      takeoverAddress,
      transactionSignature
    } = body;

    if (!contributionId || !contributor || !takeoverAddress || !transactionSignature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    // Get contribution and takeover details
    const result = await client.query(`
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name,
        t.is_finalized,
        t.is_successful,
        t.custom_reward_rate,
        t.v2_token_mint,
        t.vault,
        t.v1_token_mint
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.id = $1 
        AND c.contributor = $2 
        AND t.address = $3
        AND t.is_finalized = true
        AND COALESCE(c.is_claimed, false) = false
    `, [contributionId, contributor, takeoverAddress]);
    
    if (result.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: 'Invalid claim or already processed' },
        { status: 404 }
      );
    }
    
    const claim = result.rows[0];
    
    // Verify the transaction signature exists and is valid
    try {
      const tx = await connection.getTransaction(transactionSignature, {
        commitment: 'confirmed'
      });
      
      if (!tx) {
        client.release();
        return NextResponse.json(
          { success: false, error: 'Transaction not found or not confirmed' },
          { status: 400 }
        );
      }
    } catch (error) {
      client.release();
      return NextResponse.json(
        { success: false, error: 'Invalid transaction signature' },
        { status: 400 }
      );
    }
    
    // Calculate claim amounts
    const contributionAmount = BigInt(claim.amount);
    const rewardRate = parseFloat(claim.custom_reward_rate || 1);
    
    let claimAmount: string;
    let tokenMint: string;
    let claimType: 'refund' | 'reward';
    
    if (claim.is_successful) {
      // Successful takeover - claim V2 tokens
      claimAmount = (contributionAmount * BigInt(Math.floor(rewardRate * 1000)) / BigInt(1000)).toString();
      tokenMint = claim.v2_token_mint;
      claimType = 'reward';
    } else {
      // Failed takeover - claim refund
      claimAmount = claim.amount.toString();
      tokenMint = claim.v1_token_mint;
      claimType = 'refund';
    }
    
    // Update contribution as claimed
    await client.query(`
      UPDATE contributions 
      SET 
        is_claimed = true,
        claim_signature = $1,
        claim_amount = $2,
        claim_type = $3,
        claimed_at = NOW()
      WHERE id = $4
    `, [transactionSignature, claimAmount, claimType, contributionId]);
    
    // Update takeover claim statistics
    await client.query(`
      UPDATE takeovers 
      SET 
        total_claimed = COALESCE(total_claimed, 0) + $1,
        claimed_count = COALESCE(claimed_count, 0) + 1
      WHERE id = $2
    `, [claimAmount, claim.takeover_id]);
    
    client.release();
    
    return NextResponse.json({
      success: true,
      claim: {
        contributionId,
        takeoverAddress,
        contributor,
        claimAmount,
        tokenMint,
        claimType,
        transactionSignature,
        tokenName: claim.token_name
      }
    });
    
  } catch (error: any) {
    console.error('Error processing claim:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}