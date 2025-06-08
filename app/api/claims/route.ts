// app/api/claims/route.ts - Improved version with better error handling and debugging
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { 
  Connection, 
  PublicKey
} from '@solana/web3.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contributor = searchParams.get('contributor');
    const takeoverAddress = searchParams.get('takeover');
    
    console.log('🔍 Claims API GET:', { contributor, takeoverAddress });
    
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
    
    console.log('🔍 Claims query:', query);
    console.log('🔍 Claims params:', params);
    
    const result = await client.query(query, params);
    client.release();
    
    console.log('🔍 Claims query result:', result.rows.length, 'rows');
    
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
        transactionSignature: row.transaction_signature || '',
        createdAt: row.created_at || '',
        isClaimed: row.is_claimed || false,
        // Calculate claimable amounts
        refundAmount: row.is_successful ? '0' : row.amount.toString(),
        rewardAmount: row.is_successful 
          ? (contributionAmount * BigInt(Math.floor(rewardRate * 1000)) / BigInt(1000)).toString()
          : '0'
      };
    });
    
    console.log('📊 Returning claims:', claims.length);
    
    return NextResponse.json({
      success: true,
      claims,
      count: claims.length
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching claims:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Claims API POST: Processing request...');
    
    // Parse request body
    let body;
    try {
      body = await request.json();
      console.log('🔍 Claims API POST: Received body:', body);
    } catch (parseError) {
      console.error('🔍 Claims API POST: Failed to parse JSON body:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const {
      contributionId,
      contributor,
      takeoverAddress,
      transactionSignature
    } = body;

    console.log('🔍 Claims API POST: Extracted fields:', {
      contributionId,
      contributor,
      takeoverAddress,
      transactionSignature
    });

    // Validate required fields
    if (!contributionId || !contributor || !takeoverAddress || !transactionSignature) {
      const missingFields = [];
      if (!contributionId) missingFields.push('contributionId');
      if (!contributor) missingFields.push('contributor');
      if (!takeoverAddress) missingFields.push('takeoverAddress');
      if (!transactionSignature) missingFields.push('transactionSignature');
      
      console.error('🔍 Claims API POST: Missing required fields:', missingFields);
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate field types and formats
    try {
      new PublicKey(contributor);
      new PublicKey(takeoverAddress);
    } catch (validationError) {
      console.error('🔍 Claims API POST: Invalid public key format:', validationError);
      return NextResponse.json(
        { success: false, error: 'Invalid public key format' },
        { status: 400 }
      );
    }
    
    if (typeof contributionId !== 'number' && !Number.isInteger(Number(contributionId))) {
      console.error('🔍 Claims API POST: contributionId must be a number, got:', typeof contributionId);
      return NextResponse.json(
        { success: false, error: 'contributionId must be a number' },
        { status: 400 }
      );
    }

    console.log('🔍 Claims API POST: Connecting to database...');
    const client = await pool.connect();
    
    try {
      // Get contribution and takeover details
      console.log('🔍 Claims API POST: Querying contribution and takeover...');
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
        console.error('🔍 Claims API POST: Invalid claim or already processed');
        console.error('🔍 Claims API POST: Query params:', { contributionId, contributor, takeoverAddress });
        
        // Check if contribution exists at all
        const anyContributionResult = await client.query(`
          SELECT id, contributor, takeover_id, is_claimed FROM contributions WHERE id = $1
        `, [contributionId]);
        
        if (anyContributionResult.rows.length === 0) {
          console.error('🔍 Claims API POST: Contribution does not exist in database');
        } else {
          const existing = anyContributionResult.rows[0];
          console.error('🔍 Claims API POST: Contribution exists but conditions not met:', existing);
        }
        
        client.release();
        return NextResponse.json(
          { success: false, error: 'Invalid claim or already processed' },
          { status: 404 }
        );
      }
      
      const claim = result.rows[0];
      console.log('🔍 Claims API POST: Found claim:', claim);
      
      // Verify the transaction signature exists and is valid
      console.log('🔍 Claims API POST: Verifying transaction:', transactionSignature);
      try {
        const tx = await connection.getTransaction(transactionSignature, {
          commitment: 'confirmed'
        });
        
        if (!tx) {
          console.error('🔍 Claims API POST: Transaction not found or not confirmed');
          client.release();
          return NextResponse.json(
            { success: false, error: 'Transaction not found or not confirmed' },
            { status: 400 }
          );
        }
        
        console.log('🔍 Claims API POST: Transaction verified successfully');
      } catch (error) {
        console.error('🔍 Claims API POST: Transaction verification failed:', error);
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
      
      console.log('🔍 Claims API POST: Calculated claim details:', {
        claimAmount,
        tokenMint,
        claimType
      });
      
      // 🔥 UPDATED: Check if columns exist before updating
      console.log('🔍 Claims API POST: Checking table schema...');
      const schemaResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'contributions' AND table_schema = 'public'
      `);
      
      const availableColumns = schemaResult.rows.map(row => row.column_name);
      console.log('🔍 Available columns in contributions table:', availableColumns);
      
      // Build update query based on available columns
      let updateQuery = `UPDATE contributions SET `;
      let updateParams = [];
      let paramIndex = 1;
      
      // Always try to set is_claimed if the column exists
      if (availableColumns.includes('is_claimed')) {
        updateQuery += `is_claimed = $${paramIndex}`;
        updateParams.push(true);
        paramIndex++;
      }
      
      // Add optional columns if they exist
      const optionalFields = [
        { column: 'claim_signature', value: transactionSignature },
        { column: 'claim_amount', value: claimAmount },
        { column: 'claim_type', value: claimType },
        { column: 'claimed_at', value: new Date() }
      ];
      
      for (const field of optionalFields) {
        if (availableColumns.includes(field.column)) {
          if (updateParams.length > 0) updateQuery += ', ';
          updateQuery += `${field.column} = $${paramIndex}`;
          updateParams.push(field.value);
          paramIndex++;
        }
      }
      
      updateQuery += ` WHERE id = $${paramIndex}`;
      updateParams.push(contributionId);
      
      console.log('🔍 Claims API POST: Update query:', updateQuery);
      console.log('🔍 Claims API POST: Update params:', updateParams);
      
      // Update contribution as claimed
      await client.query(updateQuery, updateParams);
      
      // Try to update takeover statistics if columns exist
      try {
        const takeoverSchemaResult = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'takeovers' AND table_schema = 'public'
        `);
        
        const takeoverColumns = takeoverSchemaResult.rows.map(row => row.column_name);
        console.log('🔍 Available columns in takeovers table:', takeoverColumns);
        
        let takeoverUpdateQuery = `UPDATE takeovers SET `;
        let takeoverUpdateParams = [];
        let takeoverParamIndex = 1;
        
        if (takeoverColumns.includes('total_claimed')) {
          takeoverUpdateQuery += `total_claimed = COALESCE(total_claimed, 0) + $${takeoverParamIndex}`;
          takeoverUpdateParams.push(claimAmount);
          takeoverParamIndex++;
        }
        
        if (takeoverColumns.includes('claimed_count')) {
          if (takeoverUpdateParams.length > 0) takeoverUpdateQuery += ', ';
          takeoverUpdateQuery += `claimed_count = COALESCE(claimed_count, 0) + $${takeoverParamIndex}`;
          takeoverUpdateParams.push(1);
          takeoverParamIndex++;
        }
        
        if (takeoverUpdateParams.length > 0) {
          takeoverUpdateQuery += ` WHERE id = $${takeoverParamIndex}`;
          takeoverUpdateParams.push(claim.takeover_id);
          
          console.log('🔍 Claims API POST: Takeover update query:', takeoverUpdateQuery);
          await client.query(takeoverUpdateQuery, takeoverUpdateParams);
        }
        
      } catch (takeoverUpdateError) {
        console.warn('🔍 Claims API POST: Failed to update takeover stats (non-critical):', takeoverUpdateError);
      }
      
      client.release();
      
      console.log('🔍 Claims API POST: Successfully processed claim');
      
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
      
    } catch (dbError) {
      console.error('🔍 Claims API POST: Database error:', dbError);
      client.release();
      throw dbError;
    }
    
  } catch (error: any) {
    console.error('🔍 Claims API POST: Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}