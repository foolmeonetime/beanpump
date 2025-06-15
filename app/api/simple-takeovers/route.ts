// app/api/simple-takeovers/route.ts - Complete simple API with fixed BigInt handling
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { processTakeoverCalculations } from '@/lib/utils/takeover-calculations';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Convert database bigint values to strings for JavaScript compatibility
 */
function convertBigIntFields(row: any): any {
  return {
    ...row,
    // Convert bigint fields to strings to avoid JSON serialization issues
    min_amount: row.min_amount?.toString() || '0',
    start_time: row.start_time?.toString() || '0',
    end_time: row.end_time?.toString() || '0',
    total_contributed: row.total_contributed?.toString() || '0',
    v1_total_supply: row.v1_total_supply?.toString(),
    v2_total_supply: row.v2_total_supply?.toString(),
    calculated_min_amount: row.calculated_min_amount?.toString(),
    max_safe_total_contribution: row.max_safe_total_contribution?.toString(),
    v1_market_price_lamports: row.v1_market_price_lamports?.toString(),
    reward_pool_tokens: row.reward_pool_tokens?.toString(),
    liquidity_pool_tokens: row.liquidity_pool_tokens?.toString(),
    sol_for_liquidity: row.sol_for_liquidity?.toString(),
  };
}

/**
 * Convert input values to appropriate database types - fixed BigInt literal usage
 */
function prepareBigIntValue(value: string | number | undefined | null): bigint | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  try {
    // Use BigInt() constructor instead of literals for ES2020 compatibility
    return BigInt(value.toString());
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  console.log('🔍 Simple takeovers API called');
  
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const status = searchParams.get('status');
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');
  
  try {
    const client = await pool.connect();
    
    try {
      console.log('📊 Querying takeovers...');
      
      // Build query with comprehensive field selection
      let query = `
        SELECT 
          id, address, authority, v1_token_mint, vault, min_amount,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, has_v2_mint, v2_token_mint, v2_total_supply,
          custom_reward_rate, token_name, image_url, v1_total_supply,
          reward_pool_tokens, liquidity_pool_tokens, reward_rate_bp,
          target_participation_bp, calculated_min_amount, max_safe_total_contribution,
          v1_market_price_lamports, sol_for_liquidity, jupiter_swap_completed,
          lp_created, participation_rate_bp, final_safety_utilization,
          final_reward_rate, created_at, updated_at
        FROM takeovers
      `;
      
      let params: any[] = [];
      let conditions: string[] = [];
      
      // Add address filter if provided
      if (address) {
        conditions.push(`address = $${params.length + 1}`);
        params.push(address);
      }
      
      // Add status filter if provided
      if (status) {
        if (status === 'active') {
          conditions.push(`is_finalized = false AND end_time > $${params.length + 1}`);
          params.push(BigInt(Math.floor(Date.now() / 1000)));
        } else if (status === 'ended') {
          conditions.push(`is_finalized = false AND end_time <= $${params.length + 1}`);
          params.push(BigInt(Math.floor(Date.now() / 1000)));
        } else if (status === 'finalized') {
          conditions.push(`is_finalized = true`);
        }
      }
      
      // Apply WHERE conditions
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      // Add ordering and pagination
      query += ` ORDER BY created_at DESC`;
      
      if (limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
      }
      
      if (offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(parseInt(offset));
      }
      
      console.log('🔍 Executing query:', query);
      console.log('📝 Query params:', params);
      
      const result = await client.query(query, params);
      const rawTakeovers = result.rows;
      
      console.log(`✅ Found ${rawTakeovers.length} takeovers`);
      
      // Convert BigInt fields and process calculations
      const processedTakeovers = rawTakeovers
        .map(convertBigIntFields)
        .map(processTakeoverCalculations);
      
      return NextResponse.json({
        success: true,
        takeovers: processedTakeovers,
        count: processedTakeovers.length,
        query: {
          address,
          status,
          limit: limit ? parseInt(limit) : null,
          offset: offset ? parseInt(offset) : null
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error: any) {
    console.error('💥 Simple takeover query error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message,
        code: error.code || 'QUERY_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      takeovers: [],
      count: 0
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('📝 Simple takeover creation called');
  
  try {
    const body = await request.json();
    console.log('📋 Request body:', JSON.stringify(body, null, 2));
    
    const client = await pool.connect();
    
    try {
      // Check if takeover already exists
      const existingQuery = 'SELECT id FROM takeovers WHERE address = $1';
      const existingResult = await client.query(existingQuery, [body.address]);
      
      if (existingResult.rows.length > 0) {
        console.log('⚠️ Takeover already exists:', body.address);
        return NextResponse.json({
          success: false,
          error: {
            message: 'Takeover with this address already exists',
            code: 'DUPLICATE_ADDRESS'
          }
        }, { status: 409 });
      }
      
      // Create the takeover with BigInt handling
      const insertQuery = `
        INSERT INTO takeovers (
          address, authority, v1_token_mint, vault, min_amount,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, has_v2_mint, custom_reward_rate, 
          token_name, image_url, v2_token_mint, v1_total_supply,
          reward_rate_bp, calculated_min_amount, max_safe_total_contribution,
          target_participation_bp, v1_market_price_lamports, sol_for_liquidity
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING *
      `;
      
      const params = [
        body.address,
        body.authority,
        body.v1_token_mint,
        body.vault,
        prepareBigIntValue(body.min_amount) || BigInt(1000000),
        prepareBigIntValue(body.start_time) || BigInt(Math.floor(Date.now() / 1000)),
        prepareBigIntValue(body.end_time) || BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
        BigInt(0), // total_contributed
        0,  // contributor_count
        false, // is_finalized
        false, // is_successful
        body.has_v2_mint || false,
        body.custom_reward_rate || 1.5,
        body.token_name || 'Unknown Token',
        body.image_url,
        body.v2_token_mint,
        prepareBigIntValue(body.v1_total_supply),
        body.reward_rate_bp,
        prepareBigIntValue(body.calculated_min_amount),
        prepareBigIntValue(body.max_safe_total_contribution),
        body.target_participation_bp,
        prepareBigIntValue(body.v1_market_price_lamports),
        prepareBigIntValue(body.sol_for_liquidity) || BigInt(0),
      ];
      
      const result = await client.query(insertQuery, params);
      const newTakeover = result.rows[0];
      
      // Convert and process the new takeover
      const convertedTakeover = convertBigIntFields(newTakeover);
      const processedTakeover = processTakeoverCalculations(convertedTakeover);
      
      console.log('✅ Takeover created successfully:', newTakeover.id);
      
      return NextResponse.json({
        success: true,
        data: {
          takeover: processedTakeover,
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
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { status: 500 });
  }
}