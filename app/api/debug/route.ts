// app/api/debug/route.ts
// Simple debug endpoint to test database connection and basic functionality

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  console.log('🔍 Debug API called');
  
  const debug: {
    timestamp: string;
    environment: {
      NODE_ENV: string | undefined;
      DATABASE_URL: string;
      NEXT_PUBLIC_PROGRAM_ID: string;
    };
    database: string | null;
    tables: {
      exists: boolean;
      columns: { name: any; type: any; }[];
    } | null;
    takeovers: {
      count: any;
      latestCreated: any;
      tokenNames: any;
    } | null;
    error: {
      message: any;
      code: any;
      detail: any;
      stack: any;
    } | null;
  } = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'MISSING',
      NEXT_PUBLIC_PROGRAM_ID: process.env.NEXT_PUBLIC_PROGRAM_ID ? 'SET' : 'MISSING',
    },
    database: null,
    tables: null,
    takeovers: null,
    error: null
  };

  try {
    // Test database connection
    console.log('🔗 Testing database connection...');
    const client = await pool.connect();
    debug.database = 'Connected successfully';
    
    try {
      // Test if takeovers table exists
      console.log('📋 Checking takeovers table...');
      const tableCheck = await client.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'takeovers' 
        ORDER BY ordinal_position
      `);
      
      debug.tables = {
        exists: tableCheck.rows.length > 0,
        columns: tableCheck.rows.map(row => ({
          name: row.column_name,
          type: row.data_type
        }))
      };

      if (tableCheck.rows.length > 0) {
        // Test simple takeovers query
        console.log('📊 Testing takeovers query...');
        const takeoversResult = await client.query(`
          SELECT COUNT(*) as count, 
                 MAX(created_at) as latest_created,
                 array_agg(DISTINCT token_name) FILTER (WHERE token_name IS NOT NULL) as token_names
          FROM takeovers 
          LIMIT 1
        `);
        
        debug.takeovers = {
          count: takeoversResult.rows[0]?.count || 0,
          latestCreated: takeoversResult.rows[0]?.latest_created,
          tokenNames: takeoversResult.rows[0]?.token_names || []
        };
      }
      
    } finally {
      client.release();
    }
    
    console.log('✅ Debug completed successfully:', debug);
    
  } catch (error: any) {
    console.error('❌ Debug error:', error);
    debug.error = {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }

  return NextResponse.json(debug);
}