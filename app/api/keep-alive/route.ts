import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const startTime = Date.now();

  try {
    // Run a minimal query against PostgreSQL to reset the Supabase 7-day inactivity timer
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - startTime;

    if (error && error.code !== 'PGRST205') {
      return NextResponse.json(
        {
          status: 'error',
          message: error.message,
          latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'active',
      service: 'Supabase PostgreSQL & pgvector',
      ping: 'success',
      latencyMs,
      timestamp: new Date().toISOString(),
      keepAliveNotice: 'Inactivity timer reset successfully. Database is live.',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: err.message,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
