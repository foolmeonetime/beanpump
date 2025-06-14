// lib/middleware/response.ts
import { NextResponse } from 'next/server';
import { ApiResponse } from './types';

export function createApiResponse<T>(response: ApiResponse<T>): NextResponse {
  const statusCode = response.success ? 200 : getErrorStatusCode(response.error?.code);
  
  return NextResponse.json(response, { status: statusCode });
}

function getErrorStatusCode(errorCode?: string): number {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'DUPLICATE_RESOURCE':
      return 409;
    case 'RATE_LIMIT_EXCEEDED':
      return 429;
    case 'DATABASE_ERROR':
      return 500;
    default:
      return 500;
  }
}