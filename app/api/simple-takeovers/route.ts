// app/api/simple-takeovers/route.ts - Complete simple API for bigint schema
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
        console.log('🔍 Filtering by address:', address);
      }
      
      // Add status filter if provided
      if (status) {
        const now = Math.floor(Date.now() / 1000);
        switch (status.toLowerCase()) {
          case 'active':
            conditions.push(`is_finalized = false AND end_time > $${params.length + 1}`);
            params.push(now);
            break;
          case 'finalized':
            conditions.push(`is_finalized = true`);
            break;
          case 'successful':
            conditions.push(`is_finalized = true AND is_successful = true`);
            break;
          case 'failed':
            conditions.push(`is_finalized = true AND is_successful = false`);
            break;
          case 'expired':
            conditions.push(`is_finalized = false AND end_time <= $${params.length + 1}`);
            params.push(now);
            break;
        }
        console.log('🔍 Filtering by status:', status);
      }
      
      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY created_at DESC`;
      
      // Add pagination
      if (limit) {
        const limitNum = parseInt(limit);
        if (limitNum > 0 && limitNum <= 100) {
          query += ` LIMIT $${params.length + 1}`;
          params.push(limitNum);
        }
      }
      
      if (offset) {
        const offsetNum = parseInt(offset);
        if (offsetNum >= 0) {
          query += ` OFFSET $${params.length + 1}`;
          params.push(offsetNum);
        }
      }
      
      console.log('🔄 Executing query:', query.replace(/\s+/g, ' ').trim());
      console.log('📋 Query params:', params);
      
      const result = await client.query(query, params);
      
      console.log(`✅ Found ${result.rows.length} takeovers`);
      
      // Process and normalize the data
      const processedTakeovers = result.rows.map(row => {
        // First convert bigint fields to strings
        const convertedRow = convertBigIntFields(row);
        
        // Then process with calculations to add derived fields
        const processedRow = processTakeoverCalculations(convertedRow);
        
        return processedRow;
      });
      
      // Simple response structure that matches what your frontend expects
      const response = {
        success: true,
        takeovers: processedTakeovers,
        count: processedTakeovers.length,
        // Also provide in nested format for compatibility
        data: {
          takeovers: processedTakeovers,
          count: processedTakeovers.length,
        },
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
      data: {
        takeovers: [],
        count: 0,
      },
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
      const requiredFields = ['address', 'authority', 'v1_token_mint', 'vault'];
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
      
      // Prepare values for insertion
      const prepareBigIntValue = (value: string | number | undefined | null): bigint | null => {
        if (value === undefined || value === null || value === '') {
          return null;
        }
        try {
          return BigInt(value);
        } catch {
          return null;
        }
      };
      
      // Create the takeover
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
        prepareBigIntValue(body.min_amount) || 1000000n,
        prepareBigIntValue(body.start_time) || BigInt(Math.floor(Date.now() / 1000)),
        prepareBigIntValue(body.end_time) || BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
        0n, // total_contributed
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
        prepareBigIntValue(body.sol_for_liquidity) || 0n,
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
      },
    }, { status: 500 });
  }
}

// PUT endpoint for updating takeovers (simplified)
export async function PUT(request: NextRequest) {
  console.log('🔄 Simple takeover update API called');
  
  try {
    const body = await request.json();
    console.log('📝 Update request body:', body);
    
    if (!body.address) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Takeover address is required for updates',
          code: 'VALIDATION_ERROR',
        },
      }, { status: 400 });
    }
    
    const client = await pool.connect();
    
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramCount = 1;
      
      // Add address as the first parameter
      params.push(body.address);
      paramCount++;
      
      // Helper function for bigint values
      const prepareBigIntValue = (value: string | number | undefined | null): bigint | null => {
        if (value === undefined || value === null || value === '') {
          return null;
        }
        try {
          return BigInt(value);
        } catch {
          return null;
        }
      };
      
      // Build update fields dynamically
      if (body.total_contributed !== undefined) {
        updateFields.push(`total_contributed = $${paramCount++}`);
        params.push(prepareBigIntValue(body.total_contributed));
      }
      
      if (body.contributor_count !== undefined) {
        updateFields.push(`contributor_count = $${paramCount++}`);
        params.push(body.contributor_count);
      }
      
      if (body.is_finalized !== undefined) {
        updateFields.push(`is_finalized = $${paramCount++}`);
        params.push(body.is_finalized);
      }
      
      if (body.is_successful !== undefined) {
        updateFields.push(`is_successful = $${paramCount++}`);
        params.push(body.is_successful);
      }
      
      if (body.custom_reward_rate !== undefined) {
        updateFields.push(`custom_reward_rate = $${paramCount++}`);
        params.push(body.custom_reward_rate);
      }
      
      if (body.token_name !== undefined) {
        updateFields.push(`token_name = $${paramCount++}`);
        params.push(body.token_name);
      }
      
      if (body.image_url !== undefined) {
        updateFields.push(`image_url = $${paramCount++}`);
        params.push(body.image_url);
      }
      
      if (body.has_v2_mint !== undefined) {
        updateFields.push(`has_v2_mint = $${paramCount++}`);
        params.push(body.has_v2_mint);
      }
      
      if (body.v2_token_mint !== undefined) {
        updateFields.push(`v2_token_mint = $${paramCount++}`);
        params.push(body.v2_token_mint);
      }
      
      if (body.jupiter_swap_completed !== undefined) {
        updateFields.push(`jupiter_swap_completed = $${paramCount++}`);
        params.push(body.jupiter_swap_completed);
      }
      
      if (body.lp_created !== undefined) {
        updateFields.push(`lp_created = $${paramCount++}`);
        params.push(body.lp_created);
      }
      
      if (updateFields.length === 0) {
        return NextResponse.json({
          success: false,
          error: {
            message: 'No update data provided',
            code: 'VALIDATION_ERROR',
          },
        }, { status: 400 });
      }
      
      const query = `
        UPDATE takeovers 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE address = $1
        RETURNING *
      `;
      
      console.log('🔄 Executing update query...');
      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: {
            message: 'Takeover not found',
            code: 'NOT_FOUND',
          },
        }, { status: 404 });
      }
      
      const updatedTakeover = result.rows[0];
      
      // Convert and process the updated takeover
      const convertedTakeover = convertBigIntFields(updatedTakeover);
      const processedTakeover = processTakeoverCalculations(convertedTakeover);
      
      console.log('✅ Takeover updated successfully:', updatedTakeover.id);
      
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
    console.error('💥 Simple takeover update error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message || 'Failed to update takeover',
        code: error.code || 'UPDATE_ERROR',
      },
    }, { status: 500 });
  }
}