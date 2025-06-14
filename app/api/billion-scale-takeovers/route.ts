// app/api/billion-scale-claims/route.ts - Fixed imports
import { createApiRoute } from '@/lib/middleware/compose';
import { BillionScaleClaimsQuerySchema, BillionScaleClaimSchema } from '@/lib/schemas';
import { BillionScaleService } from '@/lib/services/billion-scale-service';

// GET /api/billion-scale-claims
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const contributor = searchParams!.get('contributor')!;
    const takeoverAddress = searchParams?.get('takeover') || undefined;
    const status = searchParams?.get('status') as 'claimed' | 'unclaimed' | 'all' | undefined;

    const claims = await BillionScaleService.getBillionScaleClaims(db, {
      contributor,
      takeoverAddress,
      status,
    });

    // Calculate aggregate metrics
    const aggregateMetrics = {
      totalClaims: claims.length,
      totalValue: claims.reduce((sum, claim) => {
        const amount = Number(claim.contributionAmount) / 1_000_000;
        return sum + amount;
      }, 0),
      totalSupplyBillions: claims.reduce((sum, claim) => sum + claim.v1SupplyBillions, 0),
      averageParticipation: claims.length > 0 
        ? claims.reduce((sum, claim) => sum + (claim.participationRateBp / 100), 0) / claims.length 
        : 0,
      conservativeOperations: claims.filter(claim => claim.safetyUtilization < 80).length,
      successfulClaims: claims.filter(claim => claim.isSuccessful).length,
      highRewardClaims: claims.filter(claim => claim.rewardRateBp >= 180).length,
      withLiquidityFeatures: claims.filter(claim => claim.jupiterSwapCompleted || claim.lpCreated).length,
    };

    return {
      success: true,
      data: {
        claims,
        count: claims.length,
        aggregateMetrics,
        billionScaleFeatures: {
          conservativeRewards: true,
          safetyUtilization: true,
          liquidityIntegration: true,
          overflowProtection: true,
        }
      },
    };
  },
  {
    validateQuery: BillionScaleClaimsQuerySchema,
  }
);

// POST /api/billion-scale-claims
export const POST = createApiRoute(
  async ({ db, body }) => {
    const result = await BillionScaleService.processBillionScaleClaim(db, body);
    
    return {
      success: true,
      data: {
        claim: result,
        message: 'Billion-scale claim processed successfully'
      },
    };
  },
  {
    validateBody: BillionScaleClaimSchema,
  }
);