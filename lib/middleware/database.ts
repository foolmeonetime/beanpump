// lib/middleware/database.ts
import { Pool } from 'pg';
import { ApiContext, ApiHandler, ApiResponse } from './types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export function withDatabase<T>(handler: ApiHandler<T>) {
  return async (ctx: Omit<ApiContext, 'db'>): Promise<ApiResponse<T>> => {
    const client = await pool.connect();
    
    try {
      const contextWithDb: ApiContext = {
        ...ctx,
        db: client,
      };
      
      return await handler(contextWithDb);
    } finally {
      client.release();
    }
  };
}