// app/api/sync-takeover/route.ts - Sync database with blockchain state
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      takeoverAddress,
      onChainEndTime,
      onChainTotalContributed,
      onChainContributorCount,
      onChainIsFinalized,
      onChainIsSuccessful
    } = body;

    console.log('🔄 Sync request received:', {
      takeoverAddress,
      onChainEndTime,
      onChainTotalContributed,
      onChainContributorCount,
      onChainIsFinalized,
      onChainIsSuccessful
    });

    if (!takeoverAddress) {
      return NextResponse.json(
        { success: false, error: 'Takeover address required' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    try {
      // First, get the current database state
      const currentResult = await client.query(`
        SELECT * FROM takeovers WHERE address = $1
      `, [takeoverAddress]);
      
      if (currentResult.rows.length === 0) {
        client.release();
        return NextResponse.json(
          { success: false, error: 'Takeover not found in database' },
          { status: 404 }
        );
      }
      
      const currentData = currentResult.rows[0];
      console.log('📊 Current database state:', {
        endTime: currentData.end_time,
        totalContributed: currentData.total_contributed,
        contributorCount: currentData.contributor_count,
        isFinalized: currentData.is_finalized
      });
      
      // Update takeover with on-chain data
      const updateResult = await client.query(`
        UPDATE takeovers 
        SET 
          end_time = $1,
          total_contributed = $2,
          contributor_count = $3,
          is_finalized = COALESCE($4, is_finalized),
          is_successful = COALESCE($5, is_successful),
          updated_at = NOW()
        WHERE address = $6
        RETURNING *
      `, [
        onChainEndTime,
        onChainTotalContributed,
        onChainContributorCount,
        onChainIsFinalized || false,
        onChainIsSuccessful || false,
        takeoverAddress
      ]);
      
      if (updateResult.rows.length === 0) {
        client.release();
        return NextResponse.json(
          { success: false, error: 'Failed to update takeover' },
          { status: 500 }
        );
      }
      
      const updatedData = updateResult.rows[0];
      
      console.log('✅ Successfully synced takeover:', {
        address: takeoverAddress,
        oldEndTime: currentData.end_time,
        newEndTime: updatedData.end_time,
        oldTotalContributed: currentData.total_contributed,
        newTotalContributed: updatedData.total_contributed,
        timeDifference: Math.abs(currentData.end_time - updatedData.end_time)
      });
      
      client.release();
      
      return NextResponse.json({
        success: true,
        message: 'Takeover synced with blockchain state',
        changes: {
          endTime: {
            old: currentData.end_time,
            new: updatedData.end_time,
            changed: currentData.end_time !== updatedData.end_time
          },
          totalContributed: {
            old: currentData.total_contributed,
            new: updatedData.total_contributed,
            changed: currentData.total_contributed !== updatedData.total_contributed
          },
          contributorCount: {
            old: currentData.contributor_count,
            new: updatedData.contributor_count,
            changed: currentData.contributor_count !== updatedData.contributor_count
          },
          isFinalized: {
            old: currentData.is_finalized,
            new: updatedData.is_finalized,
            changed: currentData.is_finalized !== updatedData.is_finalized
          }
        },
        takeover: {
          id: updatedData.id,
          address: updatedData.address,
          authority: updatedData.authority,
          endTime: updatedData.end_time.toString(),
          totalContributed: updatedData.total_contributed.toString(),
          contributorCount: updatedData.contributor_count,
          isFinalized: updatedData.is_finalized,
          isSuccessful: updatedData.is_successful,
          tokenName: updatedData.token_name
        }
      });
      
    } catch (dbError) {
      client.release();
      throw dbError;
    }
    
  } catch (error: any) {
    console.error('❌ Sync error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to sync takeover',
        details: error.stack
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const takeoverAddress = searchParams.get('address');
    
    if (!takeoverAddress) {
      return NextResponse.json(
        { success: false, error: 'Takeover address required' },
        { status: 400 }
      );
    }
    
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        address,
        end_time,
        total_contributed,
        contributor_count,
        is_finalized,
        is_successful,
        updated_at,
        token_name
      FROM takeovers 
      WHERE address = $1
    `, [takeoverAddress]);
    
    client.release();
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Takeover not found' },
        { status: 404 }
      );
    }
    
    const takeover = result.rows[0];
    
    return NextResponse.json({
      success: true,
      takeover: {
        address: takeover.address,
        endTime: takeover.end_time.toString(),
        totalContributed: takeover.total_contributed.toString(),
        contributorCount: takeover.contributor_count,
        isFinalized: takeover.is_finalized,
        isSuccessful: takeover.is_successful,
        lastUpdated: takeover.updated_at,
        tokenName: takeover.token_name
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching takeover sync status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}