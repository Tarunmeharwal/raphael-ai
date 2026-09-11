import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantContext } from '@/lib/auth/context';
import { rewriteQueryIfFollowUp, ChatMessageTurn } from '@/lib/rag/query-rewriter';
import { embedText } from '@/lib/rag/embeddings';
import { executeHybridSearch } from '@/lib/rag/hybrid-search';
import { streamGroundedAnswer, SourceCitation } from '@/lib/rag/llm-stream';

// Prevent Vercel from killing the SSE stream before it finishes.
// Default is 10s which cuts off long AI responses mid-stream.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext();
    const body = await req.json();

    const {
      question,
      documentId = null,
      conversationId: incomingConvId = null,
      history = [],
    } = body as {
      question: string;
      documentId?: string | null;
      conversationId?: string | null;
      history?: ChatMessageTurn[];
    };

    if (!question || !question.trim()) {
      return new Response(JSON.stringify({ error: 'Question is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const trimmedQuestion = question.trim();

    // 1 & 2 in PARALLEL: Create conversation + rewrite query simultaneously
    const [searchTargetQuery, conversationId] = await Promise.all([
      // Query rewriting (calls Gemini Flash Lite ~400ms)
      rewriteQueryIfFollowUp(trimmedQuestion, history),
      // Conversation creation (DB insert ~200ms)
      (async () => {
        if (incomingConvId) return incomingConvId;
        const title = trimmedQuestion.slice(0, 40) + (trimmedQuestion.length > 40 ? '...' : '');
        const { data: newConv } = await supabaseAdmin
          .from('conversations')
          .insert({
            organization_id: tenant.organizationId,
            user_id: tenant.userId,
            document_id: documentId,
            title,
          })
          .select('id')
          .single();
        return newConv?.id ?? null;
      })(),
    ]);

    // 3. Generate 768-dim query embedding (calls Gemini ~400ms)
    const queryEmbedding = await embedText(searchTargetQuery);

    // 4. Hybrid Search + RRF Fusion
    const isSummaryQuery =
      /\b(summary|summarize|overview|outline|brief|conclude|conclusions|findings|main points)\b/i.test(trimmedQuestion) ||
      /\b(summary|summarize|overview)\b/i.test(searchTargetQuery);

    const hybridResult = await executeHybridSearch({
      queryText: searchTargetQuery,
      queryEmbedding,
      documentId,
      organizationId: tenant.organizationId,
      vectorTopK: 10,
      keywordTopK: 10,
      finalTopK: isSummaryQuery ? 10 : 6,
      confidenceThreshold: isSummaryQuery ? 0.008 : 0.012,
    });

    // If user asked for a summary of a specific document, augment with sequential chunks across the document
    if (isSummaryQuery && documentId && hybridResult.chunks.length < 8) {
      try {
        const { data: docChunks } = await supabaseAdmin
          .from('document_chunks')
          .select('id, document_id, content, page_number, chunk_index')
          .eq('document_id', documentId)
          .order('chunk_index', { ascending: true })
          .limit(10);

        if (docChunks && docChunks.length > 0) {
          const existingIds = new Set(hybridResult.chunks.map((c) => c.id));
          for (const dc of docChunks) {
            if (!existingIds.has(dc.id)) {
              hybridResult.chunks.push({
                id: dc.id,
                documentId: dc.document_id,
                content: dc.content,
                pageNumber: dc.page_number,
                chunkIndex: dc.chunk_index,
                fusedScore: 0.015,
              });
              existingIds.add(dc.id);
            }
          }
          hybridResult.hasSufficientContext = true;
        }
      } catch (err) {
        console.warn('[Chat Route] Summary chunk augmentation failed:', err);
      }
    }

    // Check if target document name exists
    let documentName = 'Document';
    if (documentId) {
      const { data: d } = await supabaseAdmin
        .from('documents')
        .select('name')
        .eq('id', documentId)
        .single();
      if (d?.name) documentName = d.name;
    }

    // 5. Server-Sent Events (SSE) Stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send initial metadata event (conversationId, rewritten query, stats)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'metadata',
              conversationId,
              rewrittenQuery: searchTargetQuery !== trimmedQuestion ? searchTargetQuery : null,
              hasSufficientContext: hybridResult.hasSufficientContext,
              topFusedScore: hybridResult.topFusedScore,
              vectorMatches: hybridResult.totalVectorMatches,
              keywordMatches: hybridResult.totalKeywordMatches,
            })}\n\n`
          )
        );

        // 6. Grounded Refusal Check: If context is insufficient, refuse immediately without calling LLM
        if (!hybridResult.hasSufficientContext || hybridResult.chunks.length === 0) {
          const refusalText =
            "I could not find enough relevant information in the uploaded document(s) to answer this question accurately. Please try rephrasing your question or verify that the topic is covered in your document.";

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'token',
                content: refusalText,
              })}\n\n`
            )
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'sources',
                sources: [],
              })}\n\n`
            )
          );

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();

          // Persist user and assistant messages
          if (conversationId) {
            await saveMessages({
              conversationId,
              userQuestion: trimmedQuestion,
              assistantAnswer: refusalText,
              citations: [],
            });
          }
          return;
        }

        // 7. Context exists: Stream LLM response
        let fullAnswer = '';
        let finalCitations: SourceCitation[] = [];

        try {
          const generator = streamGroundedAnswer({
            question: trimmedQuestion,
            contextChunks: hybridResult.chunks,
            history,
            documentName,
          });

          for await (const chunk of generator) {
            if (chunk.type === 'token' && chunk.content) {
              fullAnswer += chunk.content;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'token',
                    content: chunk.content,
                  })}\n\n`
                )
              );
            } else if (chunk.type === 'sources' && chunk.sources) {
              finalCitations = chunk.sources;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'sources',
                    sources: chunk.sources,
                  })}\n\n`
                )
              );
            } else if (chunk.type === 'provider') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'provider',
                    content: chunk.content,
                  })}\n\n`
                )
              );
            } else if (chunk.type === 'error') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    content: chunk.content,
                  })}\n\n`
                )
              );
            }
          }
        } catch (streamErr: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                content: streamErr.message || 'Stream generation failed',
              })}\n\n`
            )
          );
        } finally {
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();

          // 8. Persist messages and citations to PostgreSQL
          if (conversationId && fullAnswer) {
            await saveMessages({
              conversationId,
              userQuestion: trimmedQuestion,
              assistantAnswer: fullAnswer,
              citations: finalCitations,
            });
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[Chat Route Error]:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Saves conversation turns and source citations to PostgreSQL
 */
async function saveMessages({
  conversationId,
  userQuestion,
  assistantAnswer,
  citations,
}: {
  conversationId: string;
  userQuestion: string;
  assistantAnswer: string;
  citations: SourceCitation[];
}) {
  try {
    // 1. Insert user message
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userQuestion,
    });

    // 2. Insert assistant message
    const { data: assistantMsg } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantAnswer,
      })
      .select('id')
      .single();

    // 3. Insert linked message sources
    if (assistantMsg?.id && citations.length > 0) {
      const sourceRows = citations.map((c) => ({
        message_id: assistantMsg.id,
        chunk_id: c.chunkId,
        document_name: c.documentName,
        page_number: c.pageNumber,
        chunk_index: c.chunkIndex,
        snippet: c.snippet,
        similarity: c.similarity || c.fusedScore || 0,
      }));

      await supabaseAdmin.from('message_sources').insert(sourceRows);
    }
  } catch (err) {
    console.warn('[DB Save Warning] Could not persist message history:', err);
  }
}
