import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  console.log('🔍 Schema check API called');
  
  const schemaInfo = {
    timestamp: new Date().toISOString(),
    table: 'takeovers',
    analysis: {
      exists: false,
      actualColumns: [] as any[],
      expectedColumns: [] as string[],
      missingColumns: [] as string[],
      extraColumns: [] as string[],
    },
    recommendations: [] as string[],
    error: null as any
  };

  // Define what columns our service expects
  const expectedColumns = [
    'id',
    'address',
    'authority', 
    'v1_token_mint',
    'vault',
    'min_amount',
    'start_time',
    'end_time',
    'custom_reward_rate',
    'reward_rate_bp',
    'target_participation_bp',
    'v1_market_price_lamports',
    'calculated_min_amount',
    'max_safe_total_contribution',
    'token_name',
    'image_url',
    'signature',
    'created_at',
    'total_contributed',
    'contributor_count',
    'is_finalized',
    'is_successful'
  ];

  schemaInfo.analysis.expectedColumns = expectedColumns;

  let client;
  
  try {
    console.log('🔗 Connecting to database...');
    client = await pool.connect();
    
    // Get detailed table information
    console.log('📋 Checking takeovers table schema...');
    const schemaResult = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        ordinal_position
      FROM information_schema.columns 
      WHERE table_name = 'takeovers' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    schemaInfo.analysis.exists = schemaResult.rows.length > 0;
    schemaInfo.analysis.actualColumns = schemaResult.rows;
    
    if (schemaInfo.analysis.exists) {
      const actualColumnNames = schemaResult.rows.map(row => row.column_name);
      
      // Find missing columns (expected but not present)
      schemaInfo.analysis.missingColumns = expectedColumns.filter(
        col => !actualColumnNames.includes(col)
      );
      
      // Find extra columns (present but not expected)
      schemaInfo.analysis.extraColumns = actualColumnNames.filter(
        col => !expectedColumns.includes(col)
      );
      
      // Generate recommendations
      if (schemaInfo.analysis.missingColumns.length > 0) {
        schemaInfo.recommendations.push(
          `⚠️ Missing ${schemaInfo.analysis.missingColumns.length} expected columns: ${schemaInfo.analysis.missingColumns.join(', ')}`
        );
        
        // SQL to add missing columns
        const alterStatements = schemaInfo.analysis.missingColumns.map(col => {
          switch (col) {
            case 'id':
              return `ALTER TABLE takeovers ADD COLUMN id SERIAL PRIMARY KEY;`;
            case 'address':
            case 'authority':
            case 'v1_token_mint':
            case 'vault':
            case 'signature':
              return `ALTER TABLE takeovers ADD COLUMN ${col} VARCHAR(255);`;
            case 'min_amount':
            case 'v1_market_price_lamports':
            case 'calculated_min_amount':
            case 'max_safe_total_contribution':
            case 'total_contributed':
              return `ALTER TABLE takeovers ADD COLUMN ${col} VARCHAR(50) DEFAULT '0';`;
            case 'start_time':
            case 'end_time':
              return `ALTER TABLE takeovers ADD COLUMN ${col} VARCHAR(20);`;
            case 'custom_reward_rate':
              return `ALTER TABLE takeovers ADD COLUMN ${col} DECIMAL(5,2) DEFAULT 1.5;`;
            case 'reward_rate_bp':
            case 'target_participation_bp':
              return `ALTER TABLE takeovers ADD COLUMN ${col} INTEGER DEFAULT 100;`;
            case 'contributor_count':
              return `ALTER TABLE takeovers ADD COLUMN ${col} INTEGER DEFAULT 0;`;
            case 'token_name':
            case 'image_url':
              return `ALTER TABLE takeovers ADD COLUMN ${col} TEXT;`;
            case 'created_at':
              return `ALTER TABLE takeovers ADD COLUMN ${col} TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`;
            case 'is_finalized':
            case 'is_successful':
              return `ALTER TABLE takeovers ADD COLUMN ${col} BOOLEAN DEFAULT FALSE;`;
            default:
              return `ALTER TABLE takeovers ADD COLUMN ${col} TEXT;`;
          }
        });
        
        schemaInfo.recommendations.push('📝 SQL to add missing columns:');
        schemaInfo.recommendations.push(...alterStatements);
      }
      
      if (schemaInfo.analysis.extraColumns.length > 0) {
        schemaInfo.recommendations.push(
          `ℹ️ Extra columns found (not used by service): ${schemaInfo.analysis.extraColumns.join(', ')}`
        );
      }
      
      if (schemaInfo.analysis.missingColumns.length === 0 && schemaInfo.analysis.extraColumns.length === 0) {
        schemaInfo.recommendations.push('✅ Table schema matches expected columns perfectly!');
      }
      
    } else {
      schemaInfo.recommendations.push('❌ Takeovers table does not exist');
      schemaInfo.recommendations.push('📝 SQL to create table:');
      
      const createTableSQL = `
CREATE TABLE takeovers (
  id SERIAL PRIMARY KEY,
  address VARCHAR(255) UNIQUE NOT NULL,
  authority VARCHAR(255) NOT NULL,
  v1_token_mint VARCHAR(255),
  vault VARCHAR(255),
  min_amount VARCHAR(50) DEFAULT '0',
  start_time VARCHAR(20),
  end_time VARCHAR(20),
  custom_reward_rate DECIMAL(5,2) DEFAULT 1.5,
  reward_rate_bp INTEGER DEFAULT 100,
  target_participation_bp INTEGER DEFAULT 100,
  v1_market_price_lamports VARCHAR(50) DEFAULT '0',
  calculated_min_amount VARCHAR(50) DEFAULT '0',
  max_safe_total_contribution VARCHAR(50) DEFAULT '0',
  token_name TEXT,
  image_url TEXT,
  signature TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_contributed VARCHAR(50) DEFAULT '0',
  contributor_count INTEGER DEFAULT 0,
  is_finalized BOOLEAN DEFAULT FALSE,
  is_successful BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_takeovers_address ON takeovers(address);
CREATE INDEX idx_takeovers_authority ON takeovers(authority);
CREATE INDEX idx_takeovers_created_at ON takeovers(created_at);
      `.trim();
      
      schemaInfo.recommendations.push(createTableSQL);
    }
    
    console.log('✅ Schema analysis completed');
    
  } catch (error: any) {
    console.error('❌ Schema check error:', error);
    schemaInfo.error = {
      message: error.message,
      code: error.code,
      detail: error.detail,
    };
  } finally {
    if (client) {
      client.release();
    }
  }
  
  return NextResponse.json(schemaInfo, { status: 200 });
}