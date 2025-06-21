import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { 
  calculateSupplyMetrics, 
  formatTokenSupply, 
  runCalculationTest,
  type TestCase 
} from '@/lib/utils/supply-calculations';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test cases for validation
const testCases: TestCase[] = [
  {
    name: "garb Token (Your Case)",
    rawSupply: "1000000000000000", // 1 trillion raw
    decimals: 6,
    targetParticipationBp: 2500, // 25%
    rewardRateBp: 140, // 1.4x
    expected: {
      actualSupply: 1_000_000_000, // 1 billion actual
      goalTokens: 250_000_000, // 250 million
      goalFormatted: "250.0M"
    }
  },
  {
    name: "Small Token Test",
    rawSupply: "10000000000", // 10 billion raw
    decimals: 6,
    targetParticipationBp: 1000, // 10%
    rewardRateBp: 120, // 1.2x
    expected: {
      actualSupply: 10_000, // 10K actual
      goalTokens: 1_000, // 1K goal
      goalFormatted: "1.0K"
    }
  },
  {
    name: "Large Token Test",
    rawSupply: "100000000000000000", // 100 trillion raw
    decimals: 9,
    targetParticipationBp: 500, // 5%
    rewardRateBp: 150, // 1.5x
    expected: {
      actualSupply: 100_000_000, // 100M actual
      goalTokens: 5_000_000, // 5M goal
      goalFormatted: "5.0M"
    }
  }
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'test';
  const address = searchParams.get('address');
  
  try {
    if (mode === 'test') {
      // Run calculation tests
      console.log('🧪 Running Supply Calculation Tests...');
      
      const results = testCases.map(testCase => {
        const testResult = runCalculationTest(testCase);
        
        console.log(`\n📋 Test: ${testCase.name}`);
        console.log(`   Result: ${testResult.passed ? '✅ PASS' : '❌ FAIL'}`);
        if (!testResult.passed) {
          testResult.discrepancies.forEach(disc => console.log(`   ❌ ${disc}`));
        }
        
        return {
          name: testCase.name,
          passed: testResult.passed,
          input: testCase,
          result: testResult.result,
          discrepancies: testResult.discrepancies
        };
      });
      
      const allPassed = results.every(r => r.passed);
      
      return NextResponse.json({
        success: true,
        testResults: results,
        summary: {
          totalTests: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length,
          allPassed
        },
        message: allPassed ? 
          '✅ All calculation tests passed!' : 
          '❌ Some calculation tests failed - check discrepancies'
      });
      
    } else if (mode === 'specific' && address) {
      // Test specific takeover from database
      const query = `
        SELECT 
          id, address, authority, v1_token_mint, vault,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, has_v2_mint,
          min_amount, calculated_min_amount, token_amount_target,
          max_safe_total_contribution, v1_total_supply, v2_total_supply,
          reward_rate_bp, target_participation_bp, participation_rate_bp,
          v1_market_price_lamports, custom_reward_rate,
          reward_pool_tokens, liquidity_pool_tokens, sol_for_liquidity,
          token_name, image_url, signature,
          jupiter_swap_completed, lp_created,
          final_safety_utilization, final_reward_rate,
          created_at, updated_at
        FROM takeovers 
        WHERE address = $1
      `;
      
      const result = await pool.query(query, [address]);
      
      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No takeover found with address: ${address}`
        });
      }
      
      const takeover = result.rows[0];
      
      // Calculate what the values SHOULD be
      const v1Supply = parseFloat(takeover.v1_total_supply || '0');
      const targetBp = parseInt(takeover.target_participation_bp || '0');
      const rewardBp = parseInt(takeover.reward_rate_bp || '0');
      
      // Assume 6 decimals for calculation (this should ideally be stored)
      const assumedDecimals = 6;
      const rawSupplyEstimate = (v1Supply).toString();
      
      const expectedMetrics = calculateSupplyMetrics(
        rawSupplyEstimate,
        assumedDecimals,
        targetBp,
        rewardBp
      );
      
      const analysis = {
        // Raw database values
        stored: {
          min_amount: takeover.min_amount,
          calculated_min_amount: takeover.calculated_min_amount,
          token_amount_target: takeover.token_amount_target,
          max_safe_total_contribution: takeover.max_safe_total_contribution,
          v1_total_supply: takeover.v1_total_supply,
          target_participation_bp: takeover.target_participation_bp,
          reward_rate_bp: takeover.reward_rate_bp,
          reward_pool_tokens: takeover.reward_pool_tokens,
          liquidity_pool_tokens: takeover.liquidity_pool_tokens,
        },
        
        // Expected calculations
        expected: {
          actualSupply: expectedMetrics.actualSupply,
          actualSupplyFormatted: expectedMetrics.goalFormatted,
          goalTokens: expectedMetrics.goalTokens,
          goalFormatted: expectedMetrics.goalFormatted,
          rewardPoolTokens: expectedMetrics.rewardPoolTokens,
          liquidityPoolTokens: expectedMetrics.liquidityPoolTokens,
          maxSafeContribution: expectedMetrics.maxSafeContribution,
          maxSafeFormatted: expectedMetrics.maxSafeFormatted,
        },
        
        // Discrepancies
        discrepancies: {
          tokenTargetStored: takeover.token_amount_target,
          tokenTargetExpected: (expectedMetrics.goalTokens * Math.pow(10, assumedDecimals)).toString(),
          tokenTargetMatch: takeover.token_amount_target == (expectedMetrics.goalTokens * Math.pow(10, assumedDecimals)).toString(),
          
          maxSafeStored: takeover.max_safe_total_contribution,
          maxSafeExpected: (expectedMetrics.maxSafeContribution * Math.pow(10, assumedDecimals)).toString(),
          maxSafeMatch: takeover.max_safe_total_contribution == (expectedMetrics.maxSafeContribution * Math.pow(10, assumedDecimals)).toString(),
        },
        
        // Goal determination logic
        goalLogic: {
          hasTokenTarget: !!(takeover.token_amount_target && parseFloat(takeover.token_amount_target) > 0),
          hasCalculatedMin: !!(takeover.calculated_min_amount && parseFloat(takeover.calculated_min_amount) > 0),
          hasMinAmount: !!(takeover.min_amount && parseFloat(takeover.min_amount) > 0),
          
          // What would be used as goal (priority order)
          goalValue: takeover.token_amount_target && parseFloat(takeover.token_amount_target) > 0 
            ? parseFloat(takeover.token_amount_target)
            : takeover.calculated_min_amount && parseFloat(takeover.calculated_min_amount) > 0
            ? parseFloat(takeover.calculated_min_amount)
            : parseFloat(takeover.min_amount || '0'),
            
          goalSource: takeover.token_amount_target && parseFloat(takeover.token_amount_target) > 0 
            ? 'token_amount_target'
            : takeover.calculated_min_amount && parseFloat(takeover.calculated_min_amount) > 0
            ? 'calculated_min_amount'
            : 'min_amount',
            
          goalDisplayFormatted: formatTokenSupply(
            (takeover.token_amount_target && parseFloat(takeover.token_amount_target) > 0 
              ? parseFloat(takeover.token_amount_target)
              : takeover.calculated_min_amount && parseFloat(takeover.calculated_min_amount) > 0
              ? parseFloat(takeover.calculated_min_amount)
              : parseFloat(takeover.min_amount || '0')
            ) / Math.pow(10, assumedDecimals)
          )
        }
      };
      
      console.log('🔍 Specific Takeover Analysis for:', address);
      console.log('\n📊 Expected vs Stored Analysis:');
      console.log('Goal (stored):', analysis.goalLogic.goalDisplayFormatted);
      console.log('Goal (expected):', expectedMetrics.goalFormatted);
      console.log('Match:', analysis.discrepancies.tokenTargetMatch);
      
      return NextResponse.json({
        success: true,
        takeover,
        analysis,
        recommendations: [
          analysis.discrepancies.tokenTargetMatch ? 
            '✅ Token amount target is correctly calculated' : 
            '❌ Token amount target calculation is incorrect',
          analysis.discrepancies.maxSafeMatch ? 
            '✅ Max safe contribution is correctly calculated' : 
            '❌ Max safe contribution calculation is incorrect',
          analysis.goalLogic.goalSource === 'token_amount_target' ?
            '✅ Using token_amount_target as goal (correct priority)' :
            `⚠️ Using ${analysis.goalLogic.goalSource} as goal (token_amount_target missing or zero)`,
        ]
      });
      
    } else if (mode === 'calculate') {
      // Manual calculation endpoint
      const rawSupply = searchParams.get('rawSupply');
      const decimals = parseInt(searchParams.get('decimals') || '6');
      const targetBp = parseInt(searchParams.get('targetBp') || '2500');
      const rewardBp = parseInt(searchParams.get('rewardBp') || '140');
      
      if (!rawSupply) {
        return NextResponse.json({
          success: false,
          error: 'rawSupply parameter required'
        });
      }
      
      const metrics = calculateSupplyMetrics(rawSupply, decimals, targetBp, rewardBp);
      
      console.log('🧮 Manual Calculation:');
      console.log(`   Raw Supply: ${rawSupply}`);
      console.log(`   Decimals: ${decimals}`);
      console.log(`   Actual Supply: ${metrics.actualSupply.toLocaleString()} (${metrics.goalFormatted})`);
      console.log(`   Goal: ${metrics.goalTokens.toLocaleString()} (${metrics.goalFormatted})`);
      
      return NextResponse.json({
        success: true,
        calculation: metrics,
        input: {
          rawSupply,
          decimals,
          targetBp,
          rewardBp
        }
      });
      
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid mode. Use: test, specific, or calculate',
        availableModes: {
          test: 'Run predefined calculation tests',
          specific: 'Analyze specific takeover by address (?mode=specific&address=...)',
          calculate: 'Manual calculation (?mode=calculate&rawSupply=...&decimals=6&targetBp=2500&rewardBp=140)'
        }
      });
    }
    
  } catch (error: any) {
    console.error('Debug calculation error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}

// POST endpoint for testing payloads
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      actualSupply, 
      decimals = 6, 
      targetParticipationBp, 
      rewardRateBp,
      additionalFields = {}
    } = body;
    
    if (!actualSupply || !targetParticipationBp || !rewardRateBp) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: actualSupply, targetParticipationBp, rewardRateBp'
      });
    }
    
    // Import the payload generator
    const { generateEnhancedPayload } = await import('@/lib/utils/supply-calculations');
    
    const payload = generateEnhancedPayload(
      parseFloat(actualSupply),
      decimals,
      targetParticipationBp,
      rewardRateBp,
      additionalFields
    );
    
    console.log('🔧 Generated Enhanced Payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    return NextResponse.json({
      success: true,
      payload,
      input: {
        actualSupply: parseFloat(actualSupply),
        decimals,
        targetParticipationBp,
        rewardRateBp,
        additionalFields
      }
    });
    
  } catch (error: any) {
    console.error('Payload generation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}