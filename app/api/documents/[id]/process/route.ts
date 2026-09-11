import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { extractTextFromPDF } from '@/lib/rag/pdf-parser';
import { chunkDocumentPages } from '@/lib/rag/chunker';
import { embedBatch } from '@/lib/rag/embeddings';

// Tell Vercel this route can run up to 300s (Pro) or 60s (Hobby).
// Without this, it defaults to 10s and kills mid-response causing
// "Unexpected end of JSON input" errors on the client.
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await context.params;

  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    // 1. Fetch document record
    const { data: doc, error: fetchErr } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchErr || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Reprocessing Avoidance: If already processed, return immediately
    if (doc.status === 'processed' && doc.chunk_count > 0) {
      return NextResponse.json({
        success: true,
        message: 'Document already processed. Serving from persistent storage.',
        document: doc,
      });
    }

    // 2. Mark status = 'processing'
    await supabaseAdmin
      .from('documents')
      .update({ status: 'processing', error_message: null })
      .eq('id', documentId);

    // 3. Download the PDF file buffer
    let fileBuffer: Buffer | null = null;

    // Helper: Extract storage path from Supabase storage URL or direct path string
    const extractStoragePath = (urlOrPath: string): string => {
      if (urlOrPath.includes('/documents/')) {
        const afterDocuments = urlOrPath.split('/documents/')[1].split('?')[0];
        return decodeURIComponent(afterDocuments);
      }
      return urlOrPath;
    };

    const storagePath = extractStoragePath(doc.file_url);

    // Primary: Download directly via Supabase Admin Storage (bypasses public/private ACLs)
    try {
      const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
        .from('documents')
        .download(storagePath);

      if (!downloadErr && fileData) {
        fileBuffer = Buffer.from(await fileData.arrayBuffer());
      } else if (downloadErr) {
        console.warn(`[Process Storage Download] Supabase storage download failed (${downloadErr.message}), trying HTTP fallback.`);
      }
    } catch (storageErr) {
      console.warn('[Process Storage Download Exception]:', storageErr);
    }

    // Fallback: If direct download didn't succeed and file_url is an HTTP(S) URL
    if (!fileBuffer && doc.file_url.startsWith('http')) {
      try {
        const resp = await fetch(doc.file_url);
        if (resp.ok) {
          fileBuffer = Buffer.from(await resp.arrayBuffer());
        } else {
          console.warn(`[Process Fetch Fallback Failed] HTTP ${resp.status} ${resp.statusText}`);
        }
      } catch (fetchErr) {
        console.warn('[Process Fetch Exception]:', fetchErr);
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error(`Failed to retrieve file from storage or URL for document: ${doc.name}`);
    }

    // 4. Extract text preserving page numbers
    const { totalPages, pages } = await extractTextFromPDF(fileBuffer);

    if (pages.length === 0 || pages.every((p) => !p.text.trim())) {
      throw new Error('No readable text could be extracted from this PDF. It may be scanned or empty.');
    }

    // 5. Recursive Chunking (~500 tokens, 50 overlap, paragraph/sentence boundaries)
    const rawChunks = chunkDocumentPages(pages, {
      targetTokens: 500,
      overlapTokens: 50,
    });

    if (rawChunks.length === 0) {
      throw new Error('Document contained no parsable content after chunking.');
    }

    // 6. Generate Embeddings via Gemini (batched with backoff)
    const chunkTexts = rawChunks.map((c) => c.content);
    const embeddings = await embedBatch(chunkTexts, 50);

    // 7. Clean up any previous chunks for this document (idempotency)
    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    // 8. Insert chunks into document_chunks table
    const rowsToInsert = rawChunks.map((chunk, i) => ({
      document_id: documentId,
      organization_id: doc.organization_id,
      content: chunk.content,
      page_number: chunk.pageNumber,
      chunk_index: chunk.chunkIndex,
      token_count: chunk.tokenCount,
      embedding: embeddings[i],
    }));

    // Insert in batches of 50 to respect database payload limits
    const insertBatchSize = 50;
    for (let i = 0; i < rowsToInsert.length; i += insertBatchSize) {
      const slice = rowsToInsert.slice(i, i + insertBatchSize);
      const { error: insertErr } = await supabaseAdmin
        .from('document_chunks')
        .insert(slice);

      if (insertErr) {
        throw new Error(`Failed storing document chunks: ${insertErr.message}`);
      }
    }

    // 9. Update document status to 'processed'
    const { data: updatedDoc, error: updateErr } = await supabaseAdmin
      .from('documents')
      .update({
        status: 'processed',
        total_pages: totalPages,
        chunk_count: rawChunks.length,
        error_message: null,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${rawChunks.length} chunks across ${totalPages} pages.`,
      document: updatedDoc,
      stats: {
        totalPages,
        chunkCount: rawChunks.length,
      },
    });
  } catch (err: any) {
    console.error(`[Process Error] Doc ID ${documentId}:`, err);
    // Mark document status as failed
    await supabaseAdmin
      .from('documents')
      .update({
        status: 'failed',
        error_message: err.message || 'Unknown extraction error',
      })
      .eq('id', documentId);

    return NextResponse.json(
      { error: err.message || 'Failed to process document' },
      { status: 500 }
    );
  }
}
