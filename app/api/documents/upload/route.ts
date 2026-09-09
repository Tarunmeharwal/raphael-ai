import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantContext } from '@/lib/auth/context';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext();
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validation: PDF file type check
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdf) {
      return NextResponse.json(
        { error: 'Invalid file format. Only PDF files are supported.' },
        { status: 400 }
      );
    }

    // Validation: File size limit check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds the 20MB size limit.' },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${tenant.organizationId}/${Date.now()}-${sanitizedName}`;

    // Upload to Supabase Storage 'documents' bucket
    const { error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Upload Error] Supabase storage upload failed:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Obtain signed/public URL or path reference
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const fileUrl = publicUrlData?.publicUrl || storagePath;

    // Insert document record in PostgreSQL
    const { data: doc, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        organization_id: tenant.organizationId,
        user_id: tenant.userId,
        name: file.name,
        file_url: fileUrl,
        file_size: file.size,
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
