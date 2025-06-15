// app/api/takeovers/route.ts - Enhanced with proper logging
import { createApiRoute } from '@/lib/middleware/compose';
import { GetTakeoversQuerySchema, CreateTakeoverSchema } from '@/lib/schemas/takeover';
import { TakeoverService } from '@/lib/services/takeover-service';
import { processTakeoverCalculations } from '@/lib/utils/takeover-calculations';

// GET /api/takeovers
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const filters = {
      authority: searchParams?.get('authority') || undefined,
      status: searchParams?.get('status') || undefined,
      limit: searchParams?.get('limit') ? Number(searchParams.get('limit')) : undefined,
      offset: searchParams?.get('offset') ? Number(searchParams.get('offset')) : undefined,
    };

    console.log('📊 Fetching takeovers with filters:', filters);
    const rawTakeovers = await TakeoverService.getTakeovers(db, filters);
    
    // Process takeovers with safe calculations
    const processedTakeovers = rawTakeovers.map(processTakeoverCalculations);
    console.log(`✅ Successfully fetched ${processedTakeovers.length} takeovers`);

    return {
      success: true,
      data: {
        takeovers: processedTakeovers,
        count: processedTakeovers.length,
      },
    };
  },
  {
    validateQuery: GetTakeoversQuerySchema,
  }
);

// POST /api/takeovers - Enhanced with comprehensive logging
export const POST = createApiRoute(
  async ({ db, body }) => {
    console.log('💾 Starting takeover creation process...');
    console.log('📝 Request body:', JSON.stringify(body, null, 2));
    
    try {
      // Pre-creation validation logging
      console.log('🔍 Validating required fields...');
      const requiredFields = ['address', 'authority', 'v1TokenMint', 'vault'];
      const missingFields = requiredFields.filter(field => !body[field]);
      
      if (missingFields.length > 0) {
        console.error('❌ Missing required fields:', missingFields);
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      console.log('✅ All required fields present');
      
      // Log database connection status
      console.log('🔗 Checking database connection...');
      const connectionTest = await db.query('SELECT NOW() as current_time');
      console.log('✅ Database connection active:', connectionTest.rows[0].current_time);
      
      // Check if takeover already exists
      console.log('🔍 Checking for existing takeover...');
      const existingCheck = await db.query(
        'SELECT address FROM takeovers WHERE address = $1',
        [body.address]
      );
      
      if (existingCheck.rows.length > 0) {
        console.warn('⚠️ Takeover already exists with address:', body.address);
        throw new Error('Takeover with this address already exists');
      }
      
      console.log('✅ No existing takeover found, proceeding with creation');
      
      // Create the takeover with detailed logging
      console.log('🚀 Creating takeover in database...');
      const startTime = Date.now();
      
      const takeover = await TakeoverService.createTakeover(db, body);
      
      const endTime = Date.now();
      console.log(`✅ Takeover created successfully in ${endTime - startTime}ms`);
      console.log('📋 Created takeover:', {
        id: takeover.id,
        address: takeover.address,
        authority: takeover.authority,
        tokenName: takeover.token_name,
        createdAt: takeover.created_at
      });
      
      // Verify the insertion by querying back
      console.log('🔍 Verifying takeover was saved...');
      const verificationQuery = await db.query(
        'SELECT id, address, token_name, created_at FROM takeovers WHERE address = $1',
        [body.address]
      );
      
      if (verificationQuery.rows.length === 0) {
        console.error('❌ CRITICAL: Takeover not found after creation!');
        throw new Error('Takeover creation failed - not found in database after insertion');
      }
      
      const verified = verificationQuery.rows[0];
      console.log('✅ Takeover verified in database:', {
        id: verified.id,
        address: verified.address,
        tokenName: verified.token_name,
        createdAt: verified.created_at
      });
      
      // Log successful completion
      console.log('🎉 Takeover creation process completed successfully');
      
      return {
        success: true,
        data: { 
          takeover,
          verification: {
            created: true,
            verified: true,
            timestamp: new Date().toISOString()
          }
        },
      };
      
    } catch (error: any) {
      console.error('💥 Takeover creation failed:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Request body that failed:', JSON.stringify(body, null, 2));
      
      // Log database state for debugging
      try {
        const dbState = await db.query(`
          SELECT COUNT(*) as total_takeovers,
                 MAX(created_at) as latest_created
          FROM takeovers
        `);
        console.log('📊 Current database state:', dbState.rows[0]);
      } catch (dbError) {
        console.error('❌ Could not query database state:', dbError);
      }
      
      // Re-throw the error to be handled by middleware
      throw error;
    }
  },
  {
    validateBody: CreateTakeoverSchema,
  }
);