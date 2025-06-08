// app/api/finalize/route.ts - Improved version with better error handling and debugging
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Helper to create finalize instruction (based on your IDL)
function createFinalizeInstruction(
  programId: PublicKey,
  takeover: PublicKey,
  authority: PublicKey,
  v2Mint: PublicKey
) {
  // Exact discriminator from your IDL: finalize_takeover
  const discriminator = Buffer.from([237, 226, 215, 181, 203, 65, 244, 223]);
  
  // Account order exactly matching your IDL
  const keys = [
    { pubkey: takeover, isSigner: false, isWritable: true },           // takeover
    { pubkey: authority, isSigner: true, isWritable: true },           // authority  
    { pubkey: v2Mint, isSigner: true, isWritable: true },              // v2_mint (signer!)
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // token_program
    { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // system_program
    { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false }, // rent
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data: discriminator,
  });
}

// GET: Check which takeovers are ready for finalization
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const authority = searchParams.get('authority'); // Optional filter by authority
    
    const client = await pool.connect();
    
    let query = `
      SELECT 
        *,
        CASE 
          WHEN total_contributed >= min_amount THEN true
          WHEN EXTRACT(EPOCH FROM NOW()) > end_time THEN true
          ELSE false
        END as ready_to_finalize,
        (total_contributed >= min_amount) as is_goal_met,
        CASE 
          WHEN total_contributed >= min_amount THEN 'success'
          WHEN EXTRACT(EPOCH FROM NOW()) > end_time THEN 'failed'
          ELSE 'active'
        END as expected_outcome
      FROM takeovers 
      WHERE is_finalized = false
    `;
    
    const params: any[] = [];
    if (authority) {
      query += ` AND authority = $1`;
      params.push(authority);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await client.query(query, params);
    client.release();
    
    const takeovers = result.rows.map(row => ({
      id: row.id,
      address: row.address,
      authority: row.authority,
      tokenName: row.token_name,
      totalContributed: row.total_contributed.toString(),
      minAmount: row.min_amount.toString(),
      endTime: row.end_time.toString(),
      contributorCount: row.contributor_count,
      customRewardRate: parseFloat(row.custom_reward_rate),
      readyToFinalize: row.ready_to_finalize,
      isGoalMet: row.is_goal_met,
      expectedOutcome: row.expected_outcome,
      progressPercentage: parseFloat(row.total_contributed) / parseFloat(row.min_amount) * 100
    }));
    
    return NextResponse.json({
      success: true,
      takeovers,
      readyCount: takeovers.filter(t => t.readyToFinalize).length
    });
    
  } catch (error: any) {
    console.error('Error fetching finalizable takeovers:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: Verify and record a finalization transaction
export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Finalize API: Processing POST request...');
    
    // Parse request body
    let body;
    try {
      body = await request.json();
      console.log('🔍 Finalize API: Received body:', body);
    } catch (parseError) {
      console.error('🔍 Finalize API: Failed to parse JSON body:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const {
      takeoverAddress,
      authority,
      transactionSignature,
      v2TokenMint, // For successful takeovers
      isSuccessful
    } = body;

    console.log('🔍 Finalize API: Extracted fields:', {
      takeoverAddress,
      authority,
      transactionSignature,
      v2TokenMint,
      isSuccessful
    });

    // Validate required fields
    if (!takeoverAddress || !authority || !transactionSignature) {
      const missingFields = [];
      if (!takeoverAddress) missingFields.push('takeoverAddress');
      if (!authority) missingFields.push('authority');
      if (!transactionSignature) missingFields.push('transactionSignature');
      
      console.error('🔍 Finalize API: Missing required fields:', missingFields);
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate field types and formats
    try {
      new PublicKey(takeoverAddress);
      new PublicKey(authority);
    } catch (validationError) {
      console.error('🔍 Finalize API: Invalid public key format:', validationError);
      return NextResponse.json(
        { success: false, error: 'Invalid public key format' },
        { status: 400 }
      );
    }
    
    if (typeof isSuccessful !== 'boolean') {
      console.error('🔍 Finalize API: isSuccessful must be boolean, got:', typeof isSuccessful);
      return NextResponse.json(
        { success: false, error: 'isSuccessful must be a boolean' },
        { status: 400 }
      );
    }

    console.log('🔍 Finalize API: Connecting to database...');
    const client = await pool.connect();
    
    try {
      // Get takeover details and verify authority
      console.log('🔍 Finalize API: Querying takeover...');
      const takeoverResult = await client.query(`
        SELECT * FROM takeovers 
        WHERE address = $1 AND authority = $2 AND is_finalized = false
      `, [takeoverAddress, authority]);
      
      if (takeoverResult.rows.length === 0) {
        console.error('🔍 Finalize API: Takeover not found or already finalized');
        console.error('🔍 Finalize API: Query params:', { takeoverAddress, authority });
        
        // Check if takeover exists at all
        const anyTakeoverResult = await client.query(`
          SELECT address, authority, is_finalized FROM takeovers WHERE address = $1
        `, [takeoverAddress]);
        
        if (anyTakeoverResult.rows.length === 0) {
          console.error('🔍 Finalize API: Takeover does not exist in database');
        } else {
          const existing = anyTakeoverResult.rows[0];
          console.error('🔍 Finalize API: Takeover exists but conditions not met:', existing);
        }
        
        client.release();
        return NextResponse.json(
          { success: false, error: 'Takeover not found or already finalized' },
          { status: 404 }
        );
      }
      
      const takeover = takeoverResult.rows[0];
      console.log('🔍 Finalize API: Found takeover:', takeover);
      
      // Verify the transaction exists and is confirmed
      console.log('🔍 Finalize API: Verifying transaction:', transactionSignature);
      try {
        const tx = await connection.getTransaction(transactionSignature, {
          commitment: 'confirmed'
        });
        
        if (!tx) {
          console.error('🔍 Finalize API: Transaction not found or not confirmed');
          client.release();
          return NextResponse.json(
            { success: false, error: 'Transaction not found or not confirmed' },
            { status: 400 }
          );
        }
        
        console.log('🔍 Finalize API: Transaction verified successfully');
      } catch (error) {
        console.error('🔍 Finalize API: Transaction verification failed:', error);
        client.release();
        return NextResponse.json(
          { success: false, error: 'Invalid transaction signature' },
          { status: 400 }
        );
      }
      
      // Calculate V2 total supply for successful takeovers
      let v2TotalSupply = '0';
      if (isSuccessful && v2TokenMint) {
        const totalContributed = BigInt(takeover.total_contributed);
        const rewardRate = parseFloat(takeover.custom_reward_rate);
        v2TotalSupply = (totalContributed * BigInt(Math.floor(rewardRate * 1000)) / BigInt(1000)).toString();
        console.log('🔍 Finalize API: Calculated V2 total supply:', v2TotalSupply);
      }
      
      // Update takeover as finalized
      console.log('🔍 Finalize API: Updating takeover in database...');
      const updateResult = await client.query(`
        UPDATE takeovers 
        SET 
          is_finalized = true,
          is_successful = $1,
          has_v2_mint = $2,
          v2_token_mint = $3,
          v2_total_supply = $4,
          finalize_tx = $5,
          finalized_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [
        isSuccessful, 
        isSuccessful && v2TokenMint ? true : false,
        v2TokenMint || null,
        v2TotalSupply,
        transactionSignature,
        takeover.id
      ]);
      
      if (updateResult.rows.length === 0) {
        throw new Error('Failed to update takeover in database');
      }
      
      console.log('🔍 Finalize API: Successfully updated takeover:', updateResult.rows[0]);
      
      client.release();
      
      return NextResponse.json({
        success: true,
        takeover: {
          id: takeover.id,
          address: takeoverAddress,
          tokenName: takeover.token_name,
          isSuccessful,
          v2TokenMint,
          transactionSignature,
          finalizedAt: new Date().toISOString()
        }
      });
      
    } catch (dbError) {
      console.error('🔍 Finalize API: Database error:', dbError);
      client.release();
      throw dbError;
    }
    
  } catch (error: any) {
    console.error('🔍 Finalize API: Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}