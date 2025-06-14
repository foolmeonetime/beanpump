// app/api/contributions/route.ts - Refactored with middleware
import { createApiRoute } from '@/lib/middleware/compose';
import { GetContributionsQuerySchema, CreateContributionSchema } from '@/lib/schemas';
import { ContributionsService } from '@/lib/services/contributions-service';

// GET /api/contributions
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const filters = {
      takeoverId: searchParams?.get('takeover_id') ? Number(searchParams.get('takeover_id')) : undefined,
      contributor: searchParams?.get('contributor') || undefined,
      limit: searchParams?.get('limit') ? Number(searchParams.get('limit')) : undefined,
      offset: searchParams?.get('offset') ? Number(searchParams.get('offset')) : undefined,
    };

    const contributions = await ContributionsService.getContributions(db, filters);

    return {
      success: true,
      data: {
        contributions,
        count: contributions.length,
      },
    };
  },
  {
    validateQuery: GetContributionsQuerySchema,
  }
);

// POST /api/contributions
export const POST = createApiRoute(
  async ({ db, body }) => {
    const result = await ContributionsService.createContribution(db, body);
    
    return {
      success: true,
      data: {
        contribution: result.contribution,
        takeoverUpdate: result.takeoverUpdate,
        message: 'Contribution created successfully'
      },
    };
  },
  {
    validateBody: CreateContributionSchema,
  }
);