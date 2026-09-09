import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Retrieve conversation
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select('*, documents(name)')
    .eq('id', id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Retrieve messages
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select(`
      id,
      role,
      content,
      created_at,
      message_sources (
        id,
        chunk_id,
        document_name,
        page_number,
        chunk_index,
        snippet,
        similarity
      )
    `)
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json({
    conversation: {
      id: conv.id,
      documentId: conv.document_id,
      documentName: (conv.documents as any)?.name || null,
      title: conv.title,
      createdAt: conv.created_at,
    },
    messages: (messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      sources: m.message_sources || [],
    })),
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { error } = await supabaseAdmin
    .from('conversations')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Conversation deleted' });
}
