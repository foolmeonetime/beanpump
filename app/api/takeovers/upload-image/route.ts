// app/api/takeovers/upload-image/route.ts - Refactored with middleware
import { createApiRoute } from '@/lib/middleware/compose';
import { ImageService } from '@/lib/services/image-service';
import { ApiError } from '@/lib/middleware/error-handler';

// POST /api/takeovers/upload-image
export const POST = createApiRoute(
  async ({ req }) => {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      throw new ApiError('No file provided', 'NO_FILE', 400);
    }

    const result = await ImageService.uploadImage({
      file,
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/']
    });
    
    return {
      success: true,
      data: {
        url: result.url,
        transactionId: result.transactionId,
        metadata: result.metadata,
      },
    };
  }
  // Note: No validation schema for FormData - handled in service
);