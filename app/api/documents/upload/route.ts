import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantContext } from '@/lib/auth/context';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext();
    const body = await req.json();
    const { name, size, fileUrl } = body;

    if (!name || !fileUrl || size === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Insert document record in PostgreSQL
    const { data: doc, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        organization_id: tenant.organizationId,
        user_id: tenant.userId,
        name: name,
        file_url: fileUrl,
        file_size: size,
        status: 'pending',
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Database Error] Insert document failed:', dbError);
      return NextResponse.json(
        { error: `Database insert failed: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      document: doc,
      message: 'Document uploaded successfully. Ready for processing.',
    });
  } catch (err: any) {
    console.error('[Upload Exception]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
