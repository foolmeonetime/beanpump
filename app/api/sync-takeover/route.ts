// app/api/sync-takeover/route.ts - Fixed imports
import { createApiRoute } from '@/lib/middleware/compose';
import { SyncTakeoverQuerySchema, SyncTakeoverSchema } from '@/lib/schemas'; // FIXED: Import from correct location
import { SyncService } from '@/lib/services/sync-service';

// GET /api/sync-takeover - Check sync status
export const GET = createApiRoute(
  async ({ db, searchParams }) => {
    const takeoverAddress = searchParams!.get('address')!;
    
    const syncStatus = await SyncService.getTakeoverSyncStatus(db, takeoverAddress);

    return {
      success: true,
      data: {
        takeover: syncStatus,
      },
    };
  },
  {
    validateQuery: SyncTakeoverQuerySchema,
  }
);

// POST /api/sync-takeover - Sync database with blockchain state
export const POST = createApiRoute(
  async ({ db, body }) => {
    const syncResult = await SyncService.syncTakeoverWithBlockchain(db, body);
    
    return {
      success: true,
      data: {
        message: 'Takeover synced with blockchain state',
        changes: syncResult.changes,
        takeover: syncResult.takeover,
      },
    };
  },
  {
    validateBody: SyncTakeoverSchema,
  }
);