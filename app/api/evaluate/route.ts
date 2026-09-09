import { NextResponse } from 'next/server';
import { runEvaluationSuite } from '@/scripts/evaluate';

export async function POST() {
  try {
    const report = await runEvaluationSuite();
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error('[Evaluation Runner Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Evaluation run failed' },
      { status: 500 }
    );
  }
}
