// app/api/claims/route.ts - Refactored with middleware
import { createApiRoute } from '@/lib/middleware/compose';
import { ClaimQuerySchema, ProcessClaimSchema } from '@/lib/schemas/takeover';
import { ClaimsService } from '@/lib/services/claims-service';

// GET /api/claims
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const contributor = searchParams!.get('contributor')!;
    const takeoverId = searchParams?.get('takeoverId') ? Number(searchParams.get('takeoverId')) : undefined;
    const takeoverAddress = searchParams?.get('takeover') || undefined;
    const status = searchParams?.get('status') as 'claimed' | 'unclaimed' | 'all' | undefined;

    const claims = await ClaimsService.getUserClaims(db, {
      contributor,
      takeoverId,
      takeoverAddress,
      status,
    });

    return {
      success: true,
      data: {
        claims,
        count: claims.length,
      },
    };
  },
  {
    validateQuery: ClaimQuerySchema,
  }
);

// POST /api/claims
export const POST = createApiRoute(
  async ({ db, body }) => {
    const { 
      contributionId, 
      contributor, 
      takeoverAddress, 
      transactionSignature,
      claimAmount,
      claimType 
    } = body;
    
    const updatedClaim = await ClaimsService.processClaim(
      db,
      contributionId,
      contributor,
      takeoverAddress,
      transactionSignature,
      claimAmount,
      claimType
    );

    return {
      success: true,
      data: { claim: updatedClaim },
    };
  },
  {
    validateBody: ProcessClaimSchema,
  }
);