// lib/middleware/types.ts
import { NextRequest, NextResponse } from 'next/server';
import { PoolClient } from 'pg';
import { z } from 'zod';

export interface ApiContext {
  req: NextRequest;
  db: PoolClient;
  body?: any;
  params?: Record<string, string>;
  searchParams?: URLSearchParams;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export type ApiHandler<T = any> = (ctx: ApiContext) => Promise<ApiResponse<T>>;

export interface MiddlewareConfig {
  requireAuth?: boolean;
  validateBody?: z.ZodSchema;
  validateQuery?: z.ZodSchema;
  rateLimit?: {
    requests: number;
    window: string;
  };
}