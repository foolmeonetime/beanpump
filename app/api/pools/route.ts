import { NextRequest, NextResponse } from 'next/server';
import { lpSimulator } from '@/lib/lp-simulator';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const poolId = searchParams.get('poolId');
    const action = searchParams.get('action');

    if (poolId && action === 'analytics') {
      // Get analytics for a specific pool
      const analytics = lpSimulator.getPoolAnalytics(poolId);
      return NextResponse.json({
        success: true,
        analytics
      });
    }

    if (poolId) {
      // Get specific pool data
      const pool = lpSimulator.getPool(poolId);
      if (!pool) {
        return NextResponse.json(
          { success: false, error: 'Pool not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        pool
      });
    }

    // Get all pools
    const pools = lpSimulator.getAllPools();
    return NextResponse.json({
      success: true,
      pools,
      count: pools.length
    });

  } catch (error: any) {
    console.error('Pool API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create':
        return await createPool(body);
      
      case 'swap':
        return await executeSwap(body);
      
      case 'add_liquidity':
        return await addLiquidity(body);
      
      case 'set_market_conditions':
        return await setMarketConditions(body);
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Pool API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function createPool(body: any) {
  const {
    tokenMint,
    tokenSymbol,
    initialSolAmount,
    initialTokenAmount,
    fee = 0.003
  } = body;

  if (!tokenMint || !tokenSymbol || !initialSolAmount || !initialTokenAmount) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    const pool = lpSimulator.createPool({
      tokenMint,
      tokenSymbol,
      initialSolAmount: Number(initialSolAmount),
      initialTokenAmount: Number(initialTokenAmount),
      fee: Number(fee)
    });

    return NextResponse.json({
      success: true,
      pool,
      message: `Pool created for ${tokenSymbol}/SOL`
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

async function executeSwap(body: any) {
  const {
    poolId,
    inputToken,
    inputAmount,
    user = 'api_user',
    slippageTolerance = 0.01
  } = body;

  if (!poolId || !inputToken || !inputAmount) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    const result = lpSimulator.executeSwap(
      poolId,
      inputToken,
      Number(inputAmount),
      user,
      Number(slippageTolerance)
    );

    return NextResponse.json({
      success: true,
      result,
      message: 'Swap executed successfully'
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

async function addLiquidity(body: any) {
  const {
    poolId,
    solAmount,
    maxTokenAmount,
    user = 'api_user'
  } = body;

  if (!poolId || !solAmount || !maxTokenAmount) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    const result = lpSimulator.addLiquidity(
      poolId,
      Number(solAmount),
      Number(maxTokenAmount),
      user
    );

    return NextResponse.json({
      success: true,
      result,
      message: 'Liquidity added successfully'
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

async function setMarketConditions(body: any) {
  const { marketConditions } = body;

  if (!marketConditions) {
    return NextResponse.json(
      { success: false, error: 'Missing market conditions' },
      { status: 400 }
    );
  }

  try {
    lpSimulator.setMarketConditions(marketConditions);

    return NextResponse.json({
      success: true,
      message: 'Market conditions updated'
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}