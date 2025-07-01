// app/api/claims/route.ts - Fixed with consistent response structure
import { createApiRoute } from '@/lib/middleware/compose';
import { ClaimQuerySchema, ProcessClaimSchema } from '@/lib/schemas/takeover';
import { ClaimsService } from '@/lib/services/claims-service';

// GET /api/claims - Simple claims overview
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    try {
      const contributor = searchParams!.get('contributor')!;
      const takeoverId = searchParams?.get('takeoverId') ? Number(searchParams.get('takeoverId')) : undefined;
      const takeoverAddress = searchParams?.get('takeover') || undefined;
      const status = searchParams?.get('status') as 'claimed' | 'unclaimed' | 'all' | undefined;

      // Use existing service but ensure we get an array
      const claims = await ClaimsService.getUserClaims(db, {
        contributor,
        takeoverId,
        takeoverAddress,
        status,
      });

      // FIXED: Ensure claims is always an array
      const safeClaims = Array.isArray(claims) ? claims : [];

      // FIXED: Match enhanced route response structure
      return {
        success: true,
        claims: safeClaims,           // Direct claims array (like enhanced route)
        summary: {                   // Add summary like enhanced route
          total: safeClaims.length,
          available: safeClaims.filter(c => c.isClaimable).length,
          claimed: safeClaims.filter(c => c.isClaimed).length,
          pending_finalization: safeClaims.filter(c => !c.isFinalized && c.status === 'pending_finalization').length,
        },
        debug: {
          queryExecuted: true,
          forceRefreshUsed: false,
          currentTime: Math.floor(Date.now() / 1000)
        }
      };

    } catch (error: any) {
      console.error('💥 Claims query failed:', error);
      
      // FIXED: Return consistent error structure with empty claims array
      return {
        success: false,
        claims: [],                  // Always provide empty array
        summary: {
          total: 0,
          available: 0,
          claimed: 0,
          pending_finalization: 0,
        },
        error: error.message || 'Failed to fetch claims',
        debug: {
          queryExecuted: false,
          forceRefreshUsed: false,
          currentTime: Math.floor(Date.now() / 1000)
        }
      };
    }
  },
  {
    validateQuery: ClaimQuerySchema,
  }
);

// POST /api/claims - Process a claim
export const POST = createApiRoute(
  async ({ db, body }) => {
    try {
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
        claim: updatedClaim,
      };

    } catch (error: any) {
      console.error('💥 Claim processing failed:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to process claim',
        claim: null,
      };
    }
  },
  {
    validateBody: ProcessClaimSchema,
  }
);