import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ document: doc });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Retrieve document to locate storage path
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('file_url')
    .eq('id', id)
    .single();

  if (doc?.file_url) {
    try {
      // Clean up Supabase storage object if feasible
      const parts = doc.file_url.split('/documents/');
      const storagePath = parts.length > 1
        ? decodeURIComponent(parts[1].split('?')[0])
        : doc.file_url;
      await supabaseAdmin.storage.from('documents').remove([storagePath]);
    } catch {
      // Non-blocking storage cleanup
    }
  }

  // Delete from PostgreSQL (foreign keys cascade to chunks and citations)
  const { error: deleteErr } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Document deleted successfully' });
}
