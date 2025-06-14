import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  try {
    const query = `
      SELECT 
        address,
        min_amount,
        calculated_min_amount,
        max_safe_total_contribution,
        target_participation_bp,
        reward_rate_bp,
        v1_total_supply,
        total_contributed,
        token_name
      FROM takeovers 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    
    const result = await pool.query(query);
    
    console.log('🔍 Debug - Raw database values:');
    result.rows.forEach((row, index) => {
      console.log(`\n📊 Takeover ${index + 1} (${row.token_name || 'Unnamed'}):`);
      console.log(`   Address: ${row.address}`);
      console.log(`   min_amount: "${row.min_amount}" (type: ${typeof row.min_amount})`);
      console.log(`   calculated_min_amount: "${row.calculated_min_amount}" (type: ${typeof row.calculated_min_amount})`);
      console.log(`   target_participation_bp: ${row.target_participation_bp}`);
      console.log(`   reward_rate_bp: ${row.reward_rate_bp}`);
      console.log(`   v1_total_supply: ${row.v1_total_supply}`);
      console.log(`   total_contributed: ${row.total_contributed}`);
      
      // Calculate what it SHOULD be
      const v1Supply = parseFloat(row.v1_total_supply || '0');
      const targetBp = parseInt(row.target_participation_bp || '0');
      const expectedMinAmount = (v1Supply * targetBp / 10000);
      console.log(`   🎯 Expected min amount: ${expectedMinAmount} (${expectedMinAmount / 1_000_000}M tokens)`);
    });
    
    return NextResponse.json({
      success: true,
      debug: result.rows,
      message: 'Check console for detailed debug info'
    });
    
  } catch (error: any) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}