// app/api/finalize/route.ts - Refactored with middleware
import { createApiRoute } from '@/lib/middleware/compose';
import { FinalizeQuerySchema, FinalizeTakeoverSchema } from '@/lib/schemas/takeover';
import { TakeoverService } from '@/lib/services/takeover-service';

// GET /api/finalize - Get finalizeable takeovers
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const authority = searchParams?.get('authority');
    
    const filters = authority ? { authority } : {};
    const takeovers = await TakeoverService.getTakeovers(db, filters);
    
    // Filter for ready-to-finalize takeovers
    const currentTime = Math.floor(Date.now() / 1000);
    const finalizeable = takeovers
      .filter(t => !t.is_finalized)
      .map(t => {
        const totalContributed = Number(t.total_contributed || 0);
        const minAmount = Number(t.calculated_min_amount || t.min_amount || 0);
        const endTime = Number(t.end_time || 0);
        
        const isGoalMet = totalContributed >= minAmount;
        const isExpired = currentTime > endTime;
        const readyToFinalize = isGoalMet || isExpired;
        
        return {
          ...t,
          readyToFinalize,
          isGoalMet,
          isExpired,
          expectedOutcome: isExpired ? (isGoalMet ? 'success' : 'failed') : 'active',
        };
      })
      .filter(t => t.readyToFinalize);

    return {
      success: true,
      data: {
        takeovers: finalizeable,
        count: finalizeable.length,
      },
    };
  },
  {
    validateQuery: FinalizeQuerySchema,
  }
);

// POST /api/finalize - Finalize a takeover
export const POST = createApiRoute(
  async ({ db, body }) => {
    const { takeoverAddress, authority, isSuccessful, transactionSignature } = body;
    
    const finalizedTakeover = await TakeoverService.finalizeTakeover(
      db,
      takeoverAddress,
      authority,
      isSuccessful,
      transactionSignature
    );

    return {
      success: true,
      data: {
        takeover: {
          id: finalizedTakeover.id,
          address: finalizedTakeover.address,
          tokenName: finalizedTakeover.token_name,
          isSuccessful: finalizedTakeover.is_successful,
          v2TokenMint: finalizedTakeover.v2_token_mint,
          transactionSignature: finalizedTakeover.finalize_tx,
          finalizedAt: finalizedTakeover.finalized_at,
        },
      },
    };
  },
  {
    validateBody: FinalizeTakeoverSchema,
  }
);