import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantContext } from '@/lib/auth/context';

export async function GET() {
  try {
    const tenant = await getTenantContext();

    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select('id, document_id, title, created_at, documents(name)')
      .eq('organization_id', tenant.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ conversations: [] });
    }

    const formatted = (conversations || []).map((c: any) => ({
      id: c.id,
      documentId: c.document_id,
      documentName: c.documents?.name || null,
      title: c.title,
      createdAt: c.created_at,
    }));

    return NextResponse.json({ conversations: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
