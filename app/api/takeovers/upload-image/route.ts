import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Option 1: Upload to Arweave using a service (recommended for production)
    // You'll need to set up an Arweave wallet and fund it
    const uploadResult = await uploadToArweave(buffer, file.type, file.name);
    
    if (uploadResult.success) {
      return NextResponse.json({
        success: true,
        url: uploadResult.url,
        transactionId: uploadResult.transactionId
      });
    } else {
      throw new Error(uploadResult.error);
    }

  } catch (error: any) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

async function uploadToArweave(buffer: Buffer, contentType: string, filename: string) {
  try {
    // Option 1: Use a third-party service like Akord or ArDrive (recommended for ease)
    // Option 2: Use Bundlr Network (good balance of features and cost)
    // Option 3: Direct Arweave upload (requires more setup)
    
    // For now, let's use a mock upload to a free service
    // In production, you'd want to use proper Arweave upload
    
    // Mock implementation - replace with actual Arweave upload
    const mockResult = await uploadToMockService(buffer, contentType, filename);
    return mockResult;
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Temporary mock function - replace with actual Arweave upload
async function uploadToMockService(buffer: Buffer, contentType: string, filename: string) {
  try {
    // Convert buffer to base64 for temporary storage
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    // In a real implementation, you would:
    // 1. Upload to Arweave using Bundlr or direct Arweave client
    // 2. Return the permanent Arweave URL
    // 3. Store the transaction ID for verification
    
    // For demo purposes, we'll use imgbb.com API (free service)
    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    formData.append('image', blob, filename);
    
    // Note: You'll need to get a free API key from imgbb.com
    const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
    
    if (!IMGBB_API_KEY) {
      // Fallback: return data URL (not recommended for production)
      console.warn('No IMGBB_API_KEY found, using data URL fallback');
      return {
        success: true,
        url: dataUrl,
        transactionId: 'mock-' + Date.now()
      };
    }
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload service failed');
    }
    
    const result = await response.json();
    
    if (result.success) {
      return {
        success: true,
        url: result.data.url,
        transactionId: result.data.id
      };
    } else {
      throw new Error('Upload failed');
    }
    
  } catch (error: any) {
    console.error('Mock upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Real Arweave upload function (uncomment and configure for production)
/*
async function uploadToArweaveReal(buffer: Buffer, contentType: string) {
  const Arweave = require('arweave');
  
  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });
  
  // You'll need to load your Arweave wallet
  const wallet = JSON.parse(process.env.ARWEAVE_WALLET_KEY || '{}');
  
  const transaction = await arweave.createTransaction({ data: buffer }, wallet);
  transaction.addTag('Content-Type', contentType);
  transaction.addTag('App-Name', 'CommunityTakeover');
  
  await arweave.transactions.sign(transaction, wallet);
  await arweave.transactions.post(transaction);
  
  return {
    success: true,
    url: `https://arweave.net/${transaction.id}`,
    transactionId: transaction.id
  };
}
*/

export const config = {
  api: {
    bodyParser: false,
  },
};