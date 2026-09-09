import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantContext } from '@/lib/auth/context';

export async function GET() {
  try {
    const tenant = await getTenantContext();

    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('id, name, file_size, total_pages, chunk_count, status, error_message, created_at')
      .eq('organization_id', tenant.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      // If table does not exist yet, return friendly empty array with schema warning
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return NextResponse.json({
          documents: [],
          schemaReady: false,
          message: 'Database tables not initialized. Please run schema.sql in Supabase SQL editor.',
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      documents: documents || [],
      schemaReady: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
