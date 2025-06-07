import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Connection, PublicKey, Transaction, Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Helper function to create finalize instruction
function createFinalizeInstruction(
  programId: PublicKey,
  takeover: PublicKey,
  authority: PublicKey,
  v2Mint: PublicKey
) {
  // Discriminator from IDL: [237, 226, 215, 181, 203, 65, 244, 223]
  const discriminator = Buffer.from([237, 226, 215, 181, 203, 65, 244, 223]);
  
  const keys = [
    { pubkey: takeover, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: v2Mint, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
  ];

  return {
    keys,
    programId,
    data: discriminator,
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log("🤖 Starting auto-finalization check...");
    
    const client = await pool.connect();
    
    // Find takeovers that should be finalized
    const result = await client.query(`
      SELECT 
        *,
        CASE 
          WHEN total_contributed >= min_amount THEN true
          WHEN EXTRACT(EPOCH FROM NOW()) > end_time THEN true
          ELSE false
        END as should_finalize,
        (total_contributed >= min_amount) as is_goal_met
      FROM takeovers 
      WHERE is_finalized = false
        AND (
          total_contributed >= min_amount 
          OR EXTRACT(EPOCH FROM NOW()) > end_time
        )
      ORDER BY created_at ASC
    `);
    
    console.log(`📊 Found ${result.rows.length} takeovers ready for finalization`);
    
    const finalizedTakeovers = [];
    const errors = [];
    
    for (const row of result.rows) {
      try {
        console.log(`🎯 Processing takeover: ${row.address}`);
        
        const isSuccessful = row.is_goal_met;
        console.log(`📈 Goal met: ${isSuccessful}`);
        
        // Update database first (optimistic update)
        await client.query(`
          UPDATE takeovers 
          SET 
            is_finalized = true,
            is_successful = $1,
            has_v2_mint = $2
          WHERE id = $3
        `, [isSuccessful, isSuccessful, row.id]);
        
        finalizedTakeovers.push({
          id: row.id,
          address: row.address,
          tokenName: row.token_name,
          isSuccessful,
          totalContributed: row.total_contributed,
          minAmount: row.min_amount,
          contributorCount: row.contributor_count
        });
        
        console.log(`✅ Finalized takeover ${row.address} - Success: ${isSuccessful}`);
        
      } catch (error: any) {
        console.error(`❌ Error finalizing takeover ${row.address}:`, error);
        errors.push({
          address: row.address,
          error: error.message
        });
        
        // Rollback database change if blockchain call failed
        try {
          await client.query(`
            UPDATE takeovers 
            SET is_finalized = false, is_successful = false, has_v2_mint = false
            WHERE id = $1
          `, [row.id]);
        } catch (rollbackError) {
          console.error(`❌ Rollback failed for ${row.address}:`, rollbackError);
        }
      }
    }
    
    client.release();
    
    console.log(`🎉 Auto-finalization complete! Finalized: ${finalizedTakeovers.length}, Errors: ${errors.length}`);
    
    return NextResponse.json({
      success: true,
      finalized: finalizedTakeovers,
      errors,
      message: `Processed ${result.rows.length} takeovers, finalized ${finalizedTakeovers.length}`
    });
    
  } catch (error: any) {
    console.error('Auto-finalization error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Manual trigger endpoint
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    // Simple secret check for manual triggers
    if (secret !== process.env.FINALIZE_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Trigger the same finalization logic
    return POST(request);
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}