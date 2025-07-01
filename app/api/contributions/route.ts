import { NextRequest, NextResponse } from 'next/server';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Enhanced validation schema
const CreateContributionSchema = z.object({
  takeoverId: z.string().min(1, 'Takeover ID is required'),
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive number string'),
  contributor: z.string().min(32, 'Contributor address must be at least 32 characters'),
  transactionSignature: z.string().min(64, 'Transaction signature must be at least 64 characters'),
  isLiquidityMode: z.boolean().optional().default(false)
});

// ✅ ENHANCED: Safe transaction wrapper with proper error handling
async function executeInTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    
    // Start transaction
    await client.query('BEGIN');
    transactionStarted = true;
    
    console.log('🔄 Transaction started');
    
    // Execute the operation
    const result = await operation(client);
    
    // Commit transaction
    await client.query('COMMIT');
    transactionStarted = false;
    
    console.log('✅ Transaction committed successfully');
    
    return result;
    
  } catch (operationError: any) {
    console.error('❌ Transaction operation failed:', operationError);
    
    // ✅ FIXED: Safe rollback with proper error handling
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK');
        console.log('🔄 Transaction rolled back due to error');
      } catch (rollbackError: any) {
        console.error('💥 CRITICAL: Rollback failed:', rollbackError);
        // Log both errors but preserve the original error
        console.error('Original operation error:', operationError);
        
        // In production, you might want to alert monitoring systems here
        if (process.env.NODE_ENV === 'production') {
          // Alert monitoring system about rollback failure
          console.error('ALERT: Database rollback failed - manual intervention may be required');
        }
      }
    }
    
    // Always throw the original operation error, not the rollback error
    throw operationError;
    
  } finally {
    // ✅ ENHANCED: Safe client release
    if (client) {
      try {
        client.release();
        console.log('🔌 Database client released');
      } catch (releaseError: any) {
        console.error('⚠️ Warning: Client release failed:', releaseError);
        // Don't throw here - just log the warning
      }
    }
  }
}

// POST /api/contributions - Create new contribution with safe transaction handling
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📥 Received contribution request:', body);
    
    // ✅ ENHANCED: Validate input data
    const validatedData = CreateContributionSchema.parse(body);
    console.log('✅ Input validation passed');

    // ✅ FIXED: Use safe transaction wrapper
    const result = await executeInTransaction(async (client) => {
      // Find takeover by ID or address
      let takeover;
      
      if (validatedData.takeoverId.match(/^\d+$/)) {
        // Numeric ID
        const takeoverResult = await client.query(
          'SELECT * FROM takeovers WHERE id = $1',
          [parseInt(validatedData.takeoverId)]
        );
        takeover = takeoverResult.rows[0];
      } else {
        // Address
        const takeoverResult = await client.query(
          'SELECT * FROM takeovers WHERE address = $1',
          [validatedData.takeoverId]
        );
        takeover = takeoverResult.rows[0];
      }

      if (!takeover) {
        throw new Error(`Takeover not found: ${validatedData.takeoverId}`);
      }

      console.log('📍 Found takeover:', takeover.id, takeover.address);

      // ✅ ENHANCED: Check for duplicate transaction signatures
      const duplicateCheck = await client.query(
        'SELECT id FROM contributions WHERE transaction_signature = $1',
        [validatedData.transactionSignature]
      );
      
      if (duplicateCheck.rows.length > 0) {
        throw new Error('Duplicate transaction signature - contribution already recorded');
      }

      // ✅ ENHANCED: Validate takeover is still active
      const now = new Date();
      const endTime = new Date(takeover.end_time);
      
      if (now > endTime) {
        throw new Error('Takeover period has ended - contributions no longer accepted');
      }

      if (takeover.is_finalized) {
        throw new Error('Takeover has been finalized - contributions no longer accepted');
      }

      // Insert contribution
      const contributionResult = await client.query(`
        INSERT INTO contributions (
          takeover_id,
          contributor, 
          amount,
          transaction_signature,
          created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        takeover.id,
        validatedData.contributor,
        validatedData.amount,
        validatedData.transactionSignature
      ]);
      
      const newContribution = contributionResult.rows[0];
      console.log('✅ Contribution recorded:', newContribution.id);
      
      // ✅ ENHANCED: Update takeover totals with atomic operations
      const updateResult = await client.query(`
        UPDATE takeovers 
        SET 
          total_contributed = COALESCE(total_contributed, 0) + $1::BIGINT,
          contributor_count = (
            SELECT COUNT(DISTINCT contributor) 
            FROM contributions 
            WHERE takeover_id = $2
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING total_contributed, contributor_count
      `, [validatedData.amount, takeover.id]);
      
      const updatedTakeover = updateResult.rows[0];
      console.log('✅ Takeover totals updated:', updatedTakeover);

      // ✅ ENHANCED: Return comprehensive data
      return {
        contribution: {
          ...newContribution,
          amount_tokens: (parseFloat(newContribution.amount) / 1_000_000).toFixed(2),
          amount_display: formatTokenAmount(parseFloat(newContribution.amount))
        },
        takeover: {
          id: takeover.id,
          address: takeover.address,
          token_name: takeover.token_name,
          total_contributed: updatedTakeover.total_contributed,
          contributor_count: updatedTakeover.contributor_count
        }
      };
    });

    return NextResponse.json({
      success: true,
      message: 'Contribution recorded successfully',
      data: result
    });

  } catch (error: any) {
    console.error('❌ Contribution recording error:', error);
    
    // ✅ ENHANCED: Detailed error response
    let errorMessage = error.message;
    let statusCode = 500;
    let errorDetails: any = undefined;
    
    if (error instanceof z.ZodError) {
      errorMessage = 'Validation failed';
      statusCode = 400;
      errorDetails = {
        validation_errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
      };
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('Duplicate')) {
      statusCode = 409; // Conflict
    } else if (error.message.includes('ended') || error.message.includes('finalized')) {
      statusCode = 400; // Bad Request
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString()
    }, { status: statusCode });
  }
}

// ✅ ENHANCED: Utility function for token amount formatting
function formatTokenAmount(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B`;
  } else if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  } else if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K`;
  } else {
    return amount.toString();
  }
}

// GET /api/contributions - Retrieve contributions with enhanced error handling
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const takeoverAddress = searchParams.get('takeover');
    const contributor = searchParams.get('contributor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Cap at 100
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    // ✅ ENHANCED: Use safe connection handling
    const result = await executeInTransaction(async (client) => {
      let query = `
        SELECT 
          c.id,
          c.takeover_id,
          c.contributor,
          c.amount,
          c.transaction_signature,
          c.created_at,
          c.is_claimed,
          c.claimed_at,
          t.address as takeover_address,
          t.token_name,
          t.is_successful,
          t.is_finalized
        FROM contributions c
        JOIN takeovers t ON c.takeover_id = t.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (takeoverAddress) {
        query += ` AND t.address = $${params.length + 1}`;
        params.push(takeoverAddress);
      }

      if (contributor) {
        query += ` AND c.contributor = $${params.length + 1}`;
        params.push(contributor);
      }

      query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const queryResult = await client.query(query, params);
      
      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM contributions c
        JOIN takeovers t ON c.takeover_id = t.id
        WHERE 1=1
      `;
      
      const countParams: any[] = [];
      
      if (takeoverAddress) {
        countQuery += ` AND t.address = $${countParams.length + 1}`;
        countParams.push(takeoverAddress);
      }

      if (contributor) {
        countQuery += ` AND c.contributor = $${countParams.length + 1}`;
        countParams.push(contributor);
      }

      const countResult = await client.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      return {
        contributions: queryResult.rows,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: result.contributions,
      meta: {
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching contributions:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch contributions',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}