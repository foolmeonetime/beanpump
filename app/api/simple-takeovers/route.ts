// app/api/simple-takeovers/route.ts
// Simplified takeovers endpoint that bypasses middleware to isolate issues

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Helper function to calculate takeover status
function calculateTakeoverStatus(takeover: any): string {
  const now = Math.floor(Date.now() / 1000);
  const endTime = parseInt(takeover.end_time) || 0;
  const minAmount = takeover.calculated_min_amount || takeover.min_amount || "0";
  const totalContributed = takeover.total_contributed || "0";
  const isGoalMet = BigInt(totalContributed) >= BigInt(minAmount);
  
  if (takeover.is_finalized) {
    return takeover.is_successful ? 'successful' : 'failed';
  }
  
  if (now >= endTime) {
    return 'expired';
  }
  
  return 'active';
}

export async function GET(request: NextRequest) {
  console.log('🔍 Simple takeovers API called');
  
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  
  try {
    const client = await pool.connect();
    
    try {
      console.log('📊 Querying takeovers...');
      
      let query = `
        SELECT 
          id,
          address,
          authority,
          v1_token_mint,
          vault,
          min_amount,
          start_time,
          end_time,
          total_contributed,
          contributor_count,
          is_finalized,
          is_successful,
          token_name,
          image_url,
          created_at,
          custom_reward_rate,
          reward_rate_bp,
          calculated_min_amount,
          max_safe_total_contribution,
          target_participation_bp,
          v1_market_price_lamports,
          signature
        FROM takeovers
      `;
      
      let params: any[] = [];
      
      // Add address filter if provided
      if (address) {
        query += ` WHERE address = $1`;
        params.push(address);
        console.log('🔍 Filtering by address:', address);
      }
      
      query += ` ORDER BY created_at DESC`;
      
      const result = await client.query(query, params);
      
      console.log(`✅ Found ${result.rows.length} takeovers`);
      
      // Process and normalize the data
      const processedTakeovers = result.rows.map(row => {
        const status = calculateTakeoverStatus(row);
        
        return {
          id: row.id,
          address: row.address,
          authority: row.authority,
          v1_token_mint: row.v1_token_mint,
          vault: row.vault,
          minAmount: row.min_amount || '1000000',
          startTime: row.start_time?.toString() || '0',
          endTime: row.end_time?.toString() || '0',
          totalContributed: row.total_contributed?.toString() || '0',
          contributorCount: row.contributor_count || 0,
          isFinalized: row.is_finalized || false,
          isSuccessful: row.is_successful || false,
          customRewardRate: row.custom_reward_rate || 1.5,
          tokenName: row.token_name || 'Unknown Token',
          imageUrl: row.image_url,
          created_at: row.created_at,
          status: status,
          // Add billion-scale fields if they exist
          rewardRateBp: row.reward_rate_bp,
          calculatedMinAmount: row.calculated_min_amount,
          maxSafeTotalContribution: row.max_safe_total_contribution,
          targetParticipationBp: row.target_participation_bp,
          v1MarketPriceLamports: row.v1_market_price_lamports,
          signature: row.signature,
          // Indicate if this is a billion-scale takeover
          isBillionScale: row.reward_rate_bp !== null && row.reward_rate_bp !== undefined,
        };
      });
      
      // Simple response structure that matches what your frontend expects
      const response = {
        success: true,
        takeovers: processedTakeovers,
        count: processedTakeovers.length,
      };
      
      return NextResponse.json(response);
      
    } finally {
      client.release();
    }
    
  } catch (error: any) {
    console.error('💥 Simple takeovers API error:', error);
    
    const errorResponse = {
      success: false,
      error: {
        message: error.message || 'Failed to fetch takeovers',
        code: error.code || 'UNKNOWN_ERROR',
      },
      takeovers: [],
      count: 0,
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// POST endpoint for creating takeovers (simplified)
export async function POST(request: NextRequest) {
  console.log('💾 Simple takeover creation API called');
  
  try {
    const body = await request.json();
    console.log('📝 Create request body:', body);
    
    const client = await pool.connect();
    
    try {
      // Basic validation
      const requiredFields = ['address', 'authority', 'v1TokenMint', 'vault'];
      const missingFields = requiredFields.filter(field => !body[field]);
      
      if (missingFields.length > 0) {
        return NextResponse.json({
          success: false,
          error: {
            message: `Missing required fields: ${missingFields.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        }, { status: 400 });
      }
      
      // Check if takeover already exists
      const existingCheck = await client.query(
        'SELECT address FROM takeovers WHERE address = $1',
        [body.address]
      );
      
      if (existingCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: {
            message: 'Takeover with this address already exists',
            code: 'DUPLICATE_ADDRESS',
          },
        }, { status: 400 });
      }
      
      // Create the takeover
      const insertQuery = `
        INSERT INTO takeovers (
          address, authority, v1_token_mint, vault, min_amount,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, custom_reward_rate, token_name,
          image_url, reward_rate_bp, calculated_min_amount,
          max_safe_total_contribution, target_participation_bp,
          v1_market_price_lamports, signature, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()
        )
        RETURNING *
      `;
      
      const params = [
        body.address,
        body.authority,
        body.v1TokenMint,
        body.vault,
        body.minAmount || '1000000',
        body.startTime || Math.floor(Date.now() / 1000).toString(),
        body.endTime || (Math.floor(Date.now() / 1000) + 86400 * 7).toString(),
        '0', // total_contributed
        0,   // contributor_count
        false, // is_finalized
        false, // is_successful
        body.customRewardRate || 1.5,
        body.tokenName || 'Unknown Token',
        body.imageUrl,
        body.rewardRateBp,
        body.calculatedMinAmount,
        body.maxSafeTotalContribution,
        body.targetParticipationBp,
        body.v1MarketPriceLamports,
        body.signature,
      ];
      
      const result = await client.query(insertQuery, params);
      const newTakeover = result.rows[0];
      
      console.log('✅ Takeover created successfully:', newTakeover.id);
      
      return NextResponse.json({
        success: true,
        data: {
          takeover: newTakeover,
        },
      });
      
    } finally {
      client.release();
    }
    
  } catch (error: any) {
    console.error('💥 Simple takeover creation error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message || 'Failed to create takeover',
        code: error.code || 'CREATION_ERROR',
      },
    }, { status: 500 });
  }
}