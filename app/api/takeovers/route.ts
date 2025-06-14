// app/api/takeovers/route.ts - Refactored with middleware
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

    const rawTakeovers = await TakeoverService.getTakeovers(db, filters);
    
    // Process takeovers with safe calculations
    const processedTakeovers = rawTakeovers.map(processTakeoverCalculations);

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

// POST /api/takeovers
export const POST = createApiRoute(
  async ({ db, body }) => {
    const takeover = await TakeoverService.createTakeover(db, body);
    
    return {
      success: true,
      data: { takeover },
    };
  },
  {
    validateBody: CreateTakeoverSchema,
  }
);