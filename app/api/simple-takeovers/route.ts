// app/api/simple-takeovers/route.ts
// Simplified takeovers endpoint that bypasses middleware to isolate issues

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  console.log('🔍 Simple takeovers API called');
  
  try {
    const client = await pool.connect();
    
    try {
      console.log('📊 Querying takeovers...');
      
      // Simple direct query without any processing
      const result = await client.query(`
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
          max_safe_total_contribution
        FROM takeovers 
        ORDER BY created_at DESC
      `);
      
      console.log(`✅ Found ${result.rows.length} takeovers`);
      
      // Simple response structure that matches what your frontend expects
      const response: {
        success: boolean;
        takeovers: any[];
        count: number;
      } = {
        success: true,
        takeovers: result.rows.map(row => ({
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
          // Add billion-scale fields if they exist
          rewardRateBp: row.reward_rate_bp,
          calculatedMinAmount: row.calculated_min_amount,
          maxSafeTotalContribution: row.max_safe_total_contribution,
          // Calculate status
          status: row.is_finalized 
            ? (row.is_successful ? 'successful' : 'failed')
            : 'active',
          progressPercentage: Math.min(
            100, 
            (parseFloat(row.total_contributed || '0') / parseFloat(row.min_amount || '1')) * 100
          )
        })),
        count: result.rows.length
      };
      
      return NextResponse.json(response);
      
    } finally {
      client.release();
    }
    
  } catch (error: any) {
    console.error('❌ Simple takeovers error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    } as {
      success: false;
      error: {
        message: string;
        code?: string;
        detail?: string;
        stack?: string;
      };
    }, { status: 500 });
  }
}