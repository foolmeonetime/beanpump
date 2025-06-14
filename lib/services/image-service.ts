// lib/services/image-service.ts
import { ApiError } from '../middleware/error-handler';

export interface UploadImageData {
  file: File;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
}

export class ImageService {
  static validateImage(file: File, maxSize: number = 10 * 1024 * 1024, allowedTypes: string[] = ['image/']) {
    // Validate file type
    if (!allowedTypes.some(type => file.type.startsWith(type))) {
      throw new ApiError('File must be an image', 'INVALID_FILE_TYPE', 400);
    }

    // Validate file size
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      throw new ApiError(`File size must be less than ${maxSizeMB}MB`, 'FILE_TOO_LARGE', 400);
    }

    return true;
  }

  static async uploadImage(data: UploadImageData) {
    const { file, maxSize = 10 * 1024 * 1024, allowedTypes = ['image/'] } = data;

    // Validate the image
    this.validateImage(file, maxSize, allowedTypes);

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // For now, convert to base64 data URL (works immediately, no external dependencies)
    // In production, you would upload to a permanent storage service
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;
    
    return {
      success: true,
      url: dataUrl,
      transactionId: `local-${Date.now()}`,
      metadata: {
        originalName: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString()
      }
    };
  }

  // For future implementation with external storage services
  static async uploadToArweave(file: File): Promise<{ url: string; transactionId: string }> {
    // TODO: Implement Arweave upload
    throw new ApiError('Arweave upload not implemented yet', 'NOT_IMPLEMENTED', 501);
  }

  static async uploadToCloudinary(file: File): Promise<{ url: string; publicId: string }> {
    // TODO: Implement Cloudinary upload
    throw new ApiError('Cloudinary upload not implemented yet', 'NOT_IMPLEMENTED', 501);
  }

  static async uploadToS3(file: File): Promise<{ url: string; key: string }> {
    // TODO: Implement S3 upload
    throw new ApiError('S3 upload not implemented yet', 'NOT_IMPLEMENTED', 501);
  }
}