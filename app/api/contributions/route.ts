import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { z } from 'zod';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Validation schema for contribution creation
const CreateContributionSchema = z.object({
  takeoverId: z.string().min(1, 'Takeover ID is required'), // Can be address or numeric ID
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive number string'),
  contributor: z.string().min(32, 'Contributor address must be at least 32 characters'),
  transactionSignature: z.string().min(64, 'Transaction signature must be at least 64 characters'),
  isLiquidityMode: z.boolean().optional().default(false)
});

// GET /api/contributions - Retrieve contributions
export async function GET(request: NextRequest) {
  let client;
  
  try {
    const { searchParams } = new URL(request.url);
    const takeoverAddress = searchParams.get('takeover');
    const contributor = searchParams.get('contributor');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    client = await pool.connect();
    
    let query = `
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name,
        t.v1_token_mint
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Add filters
    if (takeoverAddress) {
      query += ` AND t.address = $${paramIndex}`;
      params.push(takeoverAddress);
      paramIndex++;
    }

    if (contributor) {
      query += ` AND c.contributor = $${paramIndex}`;
      params.push(contributor);
      paramIndex++;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    console.log('🔍 Fetching contributions with query:', query);
    console.log('🔍 Query params:', params);

    const result = await client.query(query, params);

    // Convert amounts to display format (divide by 1M for token amounts)
    const contributions = result.rows.map(row => ({
      ...row,
      amount_tokens: (parseFloat(row.amount) / 1_000_000).toFixed(2),
      amount_display: formatTokenAmount(parseFloat(row.amount))
    }));

    return NextResponse.json({
      success: true,
      data: contributions,
      count: contributions.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching contributions:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

// POST /api/contributions - Create a new contribution
export async function POST(request: NextRequest) {
  let client;
  
  try {
    const body = await request.json();
    console.log('📝 Contribution recording request:', body);
    
    // Validate input data
    const validatedData = CreateContributionSchema.parse(body);
    
    client = await pool.connect();
    
    // Start transaction
    await client.query('BEGIN');
    
    try {
      // First, find the takeover (by address or ID)
      let takeoverQuery;
      let takeoverParams;
      
      if (isNaN(parseInt(validatedData.takeoverId))) {
        // It's an address
        takeoverQuery = 'SELECT id, address, token_name FROM takeovers WHERE address = $1';
        takeoverParams = [validatedData.takeoverId];
      } else {
        // It's a numeric ID
        takeoverQuery = 'SELECT id, address, token_name FROM takeovers WHERE id = $1';
        takeoverParams = [parseInt(validatedData.takeoverId)];
      }
      
      const takeoverResult = await client.query(takeoverQuery, takeoverParams);
      
      if (takeoverResult.rows.length === 0) {
        throw new Error(`Takeover not found: ${validatedData.takeoverId}`);
      }
      
      const takeover = takeoverResult.rows[0];
      console.log('✅ Found takeover:', takeover);
      
      // Check if contribution already exists (prevent duplicates)
      const existingContribution = await client.query(
        'SELECT id FROM contributions WHERE transaction_signature = $1',
        [validatedData.transactionSignature]
      );
      
      if (existingContribution.rows.length > 0) {
        console.log('⚠️ Contribution already recorded:', validatedData.transactionSignature);
        await client.query('COMMIT');
        return NextResponse.json({
          success: true,
          message: 'Contribution already recorded',
          data: existingContribution.rows[0]
        });
      }
      
      // Record the new contribution
      const contributionResult = await client.query(`
        INSERT INTO contributions (
          takeover_id, 
          amount, 
          contributor, 
          transaction_signature, 
          created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        takeover.id,
        validatedData.amount,
        validatedData.contributor,
        validatedData.transactionSignature
      ]);
      
      const newContribution = contributionResult.rows[0];
      console.log('✅ Contribution recorded:', newContribution);
      
      // Update takeover totals
      const updateResult = await client.query(`
        UPDATE takeovers 
        SET 
          total_contributed = COALESCE(total_contributed, 0) + $1::BIGINT,
          contributor_count = contributor_count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING total_contributed, contributor_count
      `, [validatedData.amount, takeover.id]);
      
      const updatedTakeover = updateResult.rows[0];
      console.log('✅ Takeover totals updated:', updatedTakeover);
      
      // Commit transaction
      await client.query('COMMIT');
      
      return NextResponse.json({
        success: true,
        message: 'Contribution recorded successfully',
        data: {
          contribution: {
            ...newContribution,
            amount_tokens: (parseFloat(newContribution.amount) / 1_000_000).toFixed(2),
            amount_display: formatTokenAmount(parseFloat(newContribution.amount))
          },
          takeover: {
            id: takeover.id,
            address: takeover.address,
            total_contributed: updatedTakeover.total_contributed,
            contributor_count: updatedTakeover.contributor_count
          }
        }
      });
      
    } catch (transactionError) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw transactionError;
    }
    
  } catch (error: any) {
    console.error('❌ Contribution recording error:', error);
    
    // Provide detailed error information
    let errorMessage = error.message;
    let errorDetails: any = undefined;
    
    if (error instanceof z.ZodError) {
      errorMessage = 'Validation failed';
      errorDetails = {
        validation_errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
      };
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString()
    }, { status: 500 });
    
  } finally {
    if (client) client.release();
  }
}

// PUT /api/contributions/[id] - Update contribution (for claims, etc.)
export async function PUT(request: NextRequest) {
  let client;
  
  try {
    const { searchParams } = new URL(request.url);
    const contributionId = searchParams.get('id');
    
    if (!contributionId) {
      return NextResponse.json({
        success: false,
        error: 'Contribution ID is required'
      }, { status: 400 });
    }
    
    const body = await request.json();
    console.log('📝 Updating contribution:', contributionId, body);
    
    client = await pool.connect();
    
    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (body.is_claimed !== undefined) {
      updates.push(`is_claimed = $${paramIndex}`);
      params.push(body.is_claimed);
      paramIndex++;
    }
    
    if (body.claimed_at !== undefined) {
      updates.push(`claimed_at = $${paramIndex}`);
      params.push(body.claimed_at || new Date());
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid fields to update'
      }, { status: 400 });
    }
    
    // Always update the timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    const updateQuery = `
      UPDATE contributions 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    params.push(parseInt(contributionId));
    
    const result = await client.query(updateQuery, params);
    
    if (result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Contribution not found'
      }, { status: 404 });
    }
    
    const updatedContribution = result.rows[0];
    
    return NextResponse.json({
      success: true,
      data: {
        ...updatedContribution,
        amount_tokens: (parseFloat(updatedContribution.amount) / 1_000_000).toFixed(2),
        amount_display: formatTokenAmount(parseFloat(updatedContribution.amount))
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error updating contribution:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

// Helper function to format token amounts for display
function formatTokenAmount(amount: number): string {
  const tokens = amount / 1_000_000;
  
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}B`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}M`;
  } else if (tokens >= 1) {
    return `${tokens.toFixed(1)}K`;
  } else {
    return tokens.toFixed(6);
  }
}

// Helper function to validate Solana addresses
function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Helper function to validate transaction signatures
function isValidTransactionSignature(signature: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(signature);
}