import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const takeoverId = searchParams.get('takeover_id');
    
    const client = await pool.connect();
    
    let result;
    if (takeoverId) {
      // Get contributions for a specific takeover
      result = await client.query(`
        SELECT 
          c.*,
          t.address as takeover_address,
          t.token_name
        FROM contributions c
        JOIN takeovers t ON c.takeover_id = t.id
        WHERE c.takeover_id = $1
        ORDER BY c.created_at DESC
      `, [takeoverId]);
    } else {
      // Get all contributions
      result = await client.query(`
        SELECT 
          c.*,
          t.address as takeover_address,
          t.token_name
        FROM contributions c
        JOIN takeovers t ON c.takeover_id = t.id
        ORDER BY c.created_at DESC
      `);
    }
    
    client.release();
    
    const contributions = result.rows.map(row => ({
      id: row.id,
      takeoverId: row.takeover_id,
      amount: row.amount.toString(),
      createdAt: row.created_at,
      contributor: row.contributor,
      transactionSignature: row.transaction_signature,
      takeoverAddress: row.takeover_address,
      tokenName: row.token_name
    }));
    
    return NextResponse.json({ contributions });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contributions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      takeoverId,
      amount,
      contributor,
      transactionSignature
    } = body;

    const client = await pool.connect();
    
    // Start a transaction to ensure data consistency
    await client.query('BEGIN');
    
    try {
      // Insert the contribution
      const contributionResult = await client.query(`
        INSERT INTO contributions (
          takeover_id, amount, contributor, transaction_signature
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [
        takeoverId,
        amount,
        contributor,
        transactionSignature
      ]);
      
      // Update the takeover totals
      const updateResult = await client.query(`
        UPDATE takeovers 
        SET 
          total_contributed = total_contributed + $1,
          contributor_count = contributor_count + 1
        WHERE id = $2
        RETURNING total_contributed, min_amount, is_finalized
      `, [amount, takeoverId]);
      
      // Check if takeover should be marked as successful
      const takeover = updateResult.rows[0];
      if (takeover && !takeover.is_finalized) {
        const totalContributed = BigInt(takeover.total_contributed);
        const minAmount = BigInt(takeover.min_amount);
        
        // If goal is reached, we could auto-finalize or just update status
        // For now, let's just update the progress
        console.log(`Takeover progress: ${totalContributed}/${minAmount}`);
      }
      
      await client.query('COMMIT');
      
      return NextResponse.json({ 
        contribution: contributionResult.rows[0],
        takeoverUpdate: updateResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create contribution' },
      { status: 500 }
    );
  }
}