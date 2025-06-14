// Create: app/api/fix-amounts/route.ts
// This will calculate and fix the min amounts for existing takeovers

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Fixing calculated min amounts...');
    
    // Get all takeovers that need fixing
    const selectQuery = `
      SELECT 
        address,
        v1_total_supply,
        target_participation_bp,
        reward_rate_bp,
        calculated_min_amount,
        min_amount
      FROM takeovers 
      WHERE calculated_min_amount = '0' OR calculated_min_amount = '' OR calculated_min_amount IS NULL
    `;
    
    const result = await pool.query(selectQuery);
    console.log(`Found ${result.rows.length} takeovers to fix`);
    
    for (const row of result.rows) {
      const v1Supply = parseFloat(row.v1_total_supply || '1000000000000000'); // Default 1B tokens with 6 decimals
      const targetParticipationBp = parseInt(row.target_participation_bp || '1000'); // Default 10%
      const rewardRateBp = parseInt(row.reward_rate_bp || '150'); // Default 1.5x
      
      // Calculate reward pool (80% of total supply)
      const rewardPoolTokens = v1Supply * 0.8;
      
      // Calculate based on target participation
      const participationBasedAmount = v1Supply * (targetParticipationBp / 10000);
      
      // Calculate based on reward pool capacity with safety
      const rewardRate = rewardRateBp / 10000;
      const safeRewardPool = rewardPoolTokens * 0.98; // 2% safety cushion
      const capacityBasedAmount = safeRewardPool / rewardRate;
      
      // Use the smaller of the two for safety
      const calculatedMinAmount = Math.min(participationBasedAmount, capacityBasedAmount);
      
      console.log(`\n📊 Fixing ${row.address}:`);
      console.log(`   V1 Supply: ${v1Supply / 1_000_000}M tokens`);
      console.log(`   Target: ${targetParticipationBp}bp (${targetParticipationBp/100}%)`);
      console.log(`   Participation-based: ${participationBasedAmount / 1_000_000}M tokens`);
      console.log(`   Capacity-based: ${capacityBasedAmount / 1_000_000}M tokens`);
      console.log(`   Final calculated: ${calculatedMinAmount / 1_000_000}M tokens`);
      
      // Update the database
      const updateQuery = `
        UPDATE takeovers 
        SET 
          calculated_min_amount = $1,
          max_safe_total_contribution = $2
        WHERE address = $3
      `;
      
      await pool.query(updateQuery, [
        calculatedMinAmount.toString(),
        capacityBasedAmount.toString(),
        row.address
      ]);
      
      console.log(`   ✅ Updated ${row.address}`);
    }
    
    console.log(`🎉 Fixed ${result.rows.length} takeovers`);
    
    return NextResponse.json({
      success: true,
      fixed: result.rows.length,
      message: `Successfully fixed ${result.rows.length} takeovers`
    });
    
  } catch (error: any) {
    console.error('💥 Fix error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}