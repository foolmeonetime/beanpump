import { NextRequest, NextResponse } from 'next/server';
import { Pool, PoolClient } from 'pg';
import { PublicKey } from '@solana/web3.js';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contributor = searchParams.get('contributor');
  const takeoverAddress = searchParams.get('takeover');
  const forceRefresh = searchParams.get('refresh') === 'true';
  
  if (!contributor) {
    return NextResponse.json({
      success: false,
      error: 'Contributor address is required'
    }, { status: 400 });
  }

  try {
    // Validate contributor address
    new PublicKey(contributor);
  } catch {
    return NextResponse.json({
      success: false,
      error: 'Invalid contributor address'
    }, { status: 400 });
  }

  const client = await pool.connect();
  
  try {
    console.log('🔍 Enhanced claims query for:', contributor);
    
    // If force refresh, sync with blockchain first
    if (forceRefresh && takeoverAddress) {
      await syncTakeoverState(client, takeoverAddress);
    }
    
    // Enhanced query with all necessary fields
    let claimsQuery = `
      SELECT 
        c.id,
        c.takeover_id,
        c.amount as contribution_amount,
        c.contributor,
        c.transaction_signature,
        c.created_at,
        c.is_claimed,
        c.claim_signature,
        c.claim_amount,
        c.claim_type,
        c.claimed_at,
        c.is_claimable,
        
        t.id as takeover_db_id,
        t.address as takeover_address,
        t.authority as takeover_authority,
        t.token_name,
        t.is_successful,
        t.is_finalized,
        t.custom_reward_rate,
        t.v1_token_mint,
        t.v2_token_mint,
        t.vault,
        t.has_v2_mint,
        t.total_contributed,
        t.end_time,
        
        -- Calculate claimable amounts
        CASE 
          WHEN t.is_successful = true AND t.v2_token_mint IS NOT NULL THEN
            FLOOR(c.amount::numeric * t.custom_reward_rate)::text
          ELSE 
            c.amount::text
        END as calculated_claimable_amount,
        
        CASE 
          WHEN t.is_successful = true THEN 'reward'
          ELSE 'refund' 
        END as calculated_claim_type,
        
        CASE 
          WHEN t.is_successful = true THEN t.v2_token_mint
          ELSE t.v1_token_mint
        END as calculated_token_mint
        
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.contributor = $1
    `;
    
    const params: any[] = [contributor];
    
    // Add takeover filter if specified
    if (takeoverAddress) {
      claimsQuery += ` AND t.address = $2`;
      params.push(takeoverAddress);
    }
    
    // Include both finalized and recently ended takeovers
    const currentTime = Math.floor(Date.now() / 1000);
    claimsQuery += ` AND (t.is_finalized = true OR t.end_time < $${params.length + 1})`;
    // FIXED: Convert to string since PostgreSQL expects string for timestamp comparison
    params.push(currentTime.toString());
    
    claimsQuery += ` ORDER BY c.created_at DESC`;
    
    console.log('📊 Executing enhanced claims query...');
    const result = await client.query(claimsQuery, params);
    
    // FIXED: Add explicit type annotation for row parameter
    const claims = result.rows.map((row: any) => {
      const claimableAmount = row.calculated_claimable_amount || '0';
      const tokenMint = row.calculated_token_mint;
      
      // Check if claim is actually available
      const isClaimAvailable = row.is_finalized && 
                              !row.is_claimed && 
                              tokenMint && 
                              row.vault;
      
      return {
        id: row.id,
        takeoverId: row.takeover_id,
        takeoverAddress: row.takeover_address,
        takeoverAuthority: row.takeover_authority,
        tokenName: row.token_name,
        contributionAmount: row.contribution_amount,
        isSuccessful: row.is_successful,
        isFinalized: row.is_finalized,
        customRewardRate: row.custom_reward_rate,
        claimableAmount,
        tokenMint,
        claimType: row.calculated_claim_type,
        vault: row.vault,
        v1TokenMint: row.v1_token_mint,
        v2TokenMint: row.v2_token_mint,
        hasV2Mint: row.has_v2_mint,
        isClaimed: row.is_claimed || false,
        isClaimable: isClaimAvailable,
        transactionSignature: row.transaction_signature,
        createdAt: row.created_at,
        claimedAt: row.claimed_at,
        
        // Detailed amounts for debugging
        refundAmount: row.is_successful ? '0' : row.contribution_amount,
        rewardAmount: row.is_successful ? claimableAmount : '0',
        
        // Status information
        status: getClaimStatus(row),
        debugInfo: {
          takeoverEndTime: row.end_time,
          currentTime,
          totalContributed: row.total_contributed,
          finalizationMissing: !row.is_finalized && row.end_time < currentTime
        }
      };
    });
    
    // Group claims by status for easier debugging
    // FIXED: Add explicit type annotations for filter parameters
    const claimsSummary = {
      total: claims.length,
      available: claims.filter((c: any) => c.isClaimable).length,
      claimed: claims.filter((c: any) => c.isClaimed).length,
      pending_finalization: claims.filter((c: any) => !c.isFinalized && c.debugInfo.finalizationMissing).length,
      missing_token_mint: claims.filter((c: any) => !c.tokenMint).length,
      missing_vault: claims.filter((c: any) => !c.vault).length
    };
    
    console.log('📈 Claims summary:', claimsSummary);
    
    return NextResponse.json({
      success: true,
      claims,
      summary: claimsSummary,
      debug: {
        queryExecuted: true,
        forceRefreshUsed: forceRefresh,
        currentTime
      }
    });
    
  } catch (error: any) {
    console.error('💥 Enhanced claims query failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: 'Check server logs for more information'
    }, { status: 500 });
    
  } finally {
    client.release();
  }
}

// FIXED: Add explicit type annotation for row parameter
function getClaimStatus(row: any): string {
  if (row.is_claimed) return 'claimed';
  if (!row.is_finalized) return 'pending_finalization';
  if (!row.calculated_token_mint) return 'missing_token_mint';
  if (!row.vault) return 'missing_vault';
  return 'available';
}

async function syncTakeoverState(client: PoolClient, takeoverAddress: string) {
  console.log('🔄 Force syncing takeover state:', takeoverAddress);
  
  try {
    // Check if takeover should be auto-finalized
    const now = Math.floor(Date.now() / 1000);
    
    const syncQuery = `
      SELECT 
        id, address, end_time, total_contributed, min_amount, 
        calculated_min_amount, token_amount_target, is_finalized
      FROM takeovers 
      WHERE address = $1
    `;
    
    const result = await client.query(syncQuery, [takeoverAddress]);
    
    if (result.rows.length > 0) {
      const takeover = result.rows[0];
      
      // Check if it should be finalized
      const endTime = parseInt(takeover.end_time);
      const totalContributed = BigInt(takeover.total_contributed || '0');
      const minAmount = BigInt(takeover.min_amount || '0');
      const tokenTarget = BigInt(takeover.token_amount_target || '0');
      
      const goalAmount = tokenTarget > 0n ? tokenTarget : minAmount;
      const goalMet = totalContributed >= goalAmount;
      const timeExpired = now >= endTime;
      
      if (!takeover.is_finalized && (goalMet || timeExpired)) {
        console.log('⏰ Takeover ready for finalization, triggering auto-finalize...');
        
        // Trigger auto-finalization
        try {
          const autoFinalizeResponse = await fetch('/api/auto-finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              takeoverAddress: takeoverAddress,
              force: true
            })
          });
          
          if (autoFinalizeResponse.ok) {
            console.log('✅ Auto-finalization triggered successfully');
          }
        } catch (autoError) {
          console.error('⚠️ Auto-finalization failed:', autoError);
        }
      }
    }
    
  } catch (error) {
    console.error('⚠️ Sync failed:', error);
    // Don't throw - this is optional sync
  }
}