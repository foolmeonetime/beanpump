// app/api/takeovers/route.ts - Enhanced with proper logging and address filtering
import { createApiRoute } from '@/lib/middleware/compose';
import { GetTakeoversQuerySchema, CreateTakeoverSchema } from '@/lib/schemas/takeover';
import { TakeoverService } from '@/lib/services/takeover-service';
import { processTakeoverCalculations } from '@/lib/utils/takeover-calculations';

// GET /api/takeovers
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const filters = {
      authority: searchParams?.get('authority') || undefined,
      address: searchParams?.get('address') || undefined, // Add address filter
      status: searchParams?.get('status') || undefined,
      limit: searchParams?.get('limit') ? Number(searchParams.get('limit')) : undefined,
      offset: searchParams?.get('offset') ? Number(searchParams.get('offset')) : undefined,
    };

    console.log('📊 Fetching takeovers with filters:', filters);
    
    try {
      // If a specific address is requested, use the specialized method
      if (filters.address) {
        console.log('🔍 Fetching specific takeover by address:', filters.address);
        
        try {
          const singleTakeover = await TakeoverService.getTakeoverByAddress(db, filters.address);
          const processedTakeover = processTakeoverCalculations(singleTakeover);
          
          console.log('✅ Successfully fetched single takeover');
          return {
            success: true,
            data: {
              takeovers: [processedTakeover],
              count: 1,
            },
          };
        } catch (error: any) {
          console.error('❌ Error fetching single takeover:', error.message);
          
          // If specific takeover not found, fall back to general query
          if (error.message.includes('not found')) {
            console.log('🔄 Takeover not found by address, falling back to general query');
          } else {
            throw error; // Re-throw if it's a different error
          }
        }
      }
      
      // General query for multiple takeovers
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
      
    } catch (error: any) {
      console.error('💥 Error in GET /api/takeovers:', error);
      
      // Return a structured error response
      return {
        success: false,
        error: {
          message: error.message || 'Failed to fetch takeovers',
          code: error.code || 'UNKNOWN_ERROR',
        },
        data: {
          takeovers: [],
          count: 0,
        },
      };
    }
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
        return {
          success: false,
          error: {
            message: `Missing required fields: ${missingFields.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        };
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
        return {
          success: false,
          error: {
            message: 'Takeover with this address already exists',
            code: 'DUPLICATE_ADDRESS',
          },
        };
      }
      
      console.log('✅ No existing takeover found, proceeding with creation');
      
      // Create the takeover using the service
      const newTakeover = await TakeoverService.createTakeover(db, body);
      const processedTakeover = processTakeoverCalculations(newTakeover);
      
      console.log('🎉 Takeover created successfully:', {
        id: processedTakeover.id,
        address: processedTakeover.address,
        tokenName: processedTakeover.tokenName,
      });

      return {
        success: true,
        data: {
          takeover: processedTakeover,
        },
      };
      
    } catch (error: any) {
      console.error('💥 Error creating takeover:', error);
      console.error('Stack trace:', error.stack);
      
      return {
        success: false,
        error: {
          message: error.message || 'Failed to create takeover',
          code: error.code || 'CREATION_ERROR',
        },
      };
    }
  },
  {
    validateBody: CreateTakeoverSchema,
  }
);

// PUT /api/takeovers - Update takeover data
export const PUT = createApiRoute(
  async ({ db, body }) => {
    console.log('🔄 Starting takeover update process...');
    console.log('📝 Update body:', JSON.stringify(body, null, 2));
    
    try {
      const { address, ...updateData } = body;
      
      if (!address) {
        return {
          success: false,
          error: {
            message: 'Takeover address is required for updates',
            code: 'VALIDATION_ERROR',
          },
        };
      }
      
      // Check if takeover exists
      const existingTakeover = await TakeoverService.getTakeoverByAddress(db, address);
      console.log('✅ Found existing takeover for update:', existingTakeover.id);
      
      // Update the takeover
      const updatedTakeover = await TakeoverService.updateTakeover(db, address, updateData);
      const processedTakeover = processTakeoverCalculations(updatedTakeover);
      
      console.log('✅ Takeover updated successfully:', {
        id: processedTakeover.id,
        address: processedTakeover.address,
      });

      return {
        success: true,
        data: {
          takeover: processedTakeover,
        },
      };
      
    } catch (error: any) {
      console.error('💥 Error updating takeover:', error);
      
      return {
        success: false,
        error: {
          message: error.message || 'Failed to update takeover',
          code: error.code || 'UPDATE_ERROR',
        },
      };
    }
  }
);

// DELETE /api/takeovers - Delete takeover (admin only)
export const DELETE = createApiRoute(
  async ({ db, searchParams }) => {
    const address = searchParams?.get('address');
    
    if (!address) {
      return {
        success: false,
        error: {
          message: 'Takeover address is required for deletion',
          code: 'VALIDATION_ERROR',
        },
      };
    }
    
    console.log('🗑️ Starting takeover deletion process for:', address);
    
    try {
      // Check if takeover exists
      const existingTakeover = await TakeoverService.getTakeoverByAddress(db, address);
      console.log('✅ Found takeover for deletion:', existingTakeover.id);
      
      // Delete the takeover
      await db.query('DELETE FROM takeovers WHERE address = $1', [address]);
      
      console.log('✅ Takeover deleted successfully:', address);

      return {
        success: true,
        data: {
          message: 'Takeover deleted successfully',
          deletedAddress: address,
        },
      };
      
    } catch (error: any) {
      console.error('💥 Error deleting takeover:', error);
      
      return {
        success: false,
        error: {
          message: error.message || 'Failed to delete takeover',
          code: error.code || 'DELETION_ERROR',
        },
      };
    }
  }
);