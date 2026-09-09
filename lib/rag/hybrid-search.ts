import { supabaseAdmin } from '../supabase/admin';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName?: string;
  content: string;
  pageNumber: number;
  chunkIndex: number;
  vectorRank?: number;
  keywordRank?: number;
  vectorSimilarity?: number;
  keywordRankScore?: number;
  fusedScore: number;
}

export interface HybridSearchOptions {
  queryText: string;
  queryEmbedding: number[];
  documentId?: string | null;
  organizationId?: string | null;
  vectorTopK?: number; // default 20
  keywordTopK?: number; // default 20
  finalTopK?: number; // default 6
  rrfConstant?: number; // k = 60
  confidenceThreshold?: number; // default 0.015
}

export interface HybridSearchResult {
  chunks: RetrievedChunk[];
  hasSufficientContext: boolean;
  topFusedScore: number;
  totalVectorMatches: number;
  totalKeywordMatches: number;
}

/**
 * Execute parallel vector search and keyword search, then fuse with Reciprocal Rank Fusion (RRF).
 */
export async function executeHybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult> {
  const {
    queryText,
    queryEmbedding,
    documentId = null,
    organizationId = null,
    vectorTopK = 20,
    keywordTopK = 20,
    finalTopK = 6,
    rrfConstant = 60,
    confidenceThreshold = 0.012,
  } = options;

  // 1. Run Vector Search and Keyword Search in parallel via Supabase RPC
  const [vectorPromise, keywordPromise] = await Promise.allSettled([
    // Vector search RPC
    supabaseAdmin.rpc('match_chunks_vector', {
      query_embedding: queryEmbedding,
      filter_document_id: documentId || null,
      filter_org_id: organizationId || null,
      match_count: vectorTopK,
    }),
    // Keyword search RPC
    supabaseAdmin.rpc('match_chunks_keyword', {
      query_text: queryText,
      filter_document_id: documentId || null,
      filter_org_id: organizationId || null,
      match_count: keywordTopK,
    }),
  ]);

  let vectorRows: any[] = [];
  let keywordRows: any[] = [];

  if (vectorPromise.status === 'fulfilled' && !vectorPromise.value.error) {
    vectorRows = vectorPromise.value.data || [];
  } else if (vectorPromise.status === 'rejected' || vectorPromise.value?.error) {
    console.warn('[Hybrid Search] Vector search error:', vectorPromise.status === 'fulfilled' ? vectorPromise.value.error : vectorPromise.reason);
  }

  if (keywordPromise.status === 'fulfilled' && !keywordPromise.value.error) {
    keywordRows = keywordPromise.value.data || [];
  } else {
    // If the keyword RPC fails or returns an error, fall back gracefully to direct full-text query
    try {
      let query = supabaseAdmin
        .from('document_chunks')
        .select('id, document_id, content, page_number, chunk_index')
        .textSearch('tsv', queryText, { type: 'websearch', config: 'english' })
        .limit(keywordTopK);

      if (documentId) {
        query = query.eq('document_id', documentId);
      }
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const directRes = await query;
      if (directRes.data && directRes.data.length > 0) {
        keywordRows = directRes.data.map((c, i) => ({
          ...c,
          rank: 1 / (i + 1),
        }));
      }
    } catch (fallbackErr) {
      console.warn('[Hybrid Search] Keyword search direct query fallback error:', fallbackErr);
    }
  }

  // Fallback: If RPCs are not yet created in Supabase, query document_chunks directly
  if (vectorRows.length === 0 && keywordRows.length === 0) {
    try {
      let query = supabaseAdmin
        .from('document_chunks')
        .select('id, document_id, content, page_number, chunk_index')
        .limit(finalTopK);

      if (documentId) {
        query = query.eq('document_id', documentId);
      }
      const fallbackRes = await query;
      if (fallbackRes.data && fallbackRes.data.length > 0) {
        return {
          chunks: fallbackRes.data.map((c, i) => ({
            id: c.id,
            documentId: c.document_id,
            content: c.content,
            pageNumber: c.page_number,
            chunkIndex: c.chunk_index,
            fusedScore: 1 / (rrfConstant + i + 1),
          })),
          hasSufficientContext: true,
          topFusedScore: 1 / (rrfConstant + 1),
          totalVectorMatches: 0,
          totalKeywordMatches: 0,
        };
      }
    } catch (e) {
      console.error('[Hybrid Search] Fallback query failed:', e);
    }
  }

  // 2. Build map of chunks for Reciprocal Rank Fusion (RRF)
  // RRF Formula: score = Σ 1 / (k + rank)
  const chunkMap = new Map<string, RetrievedChunk>();

  // Add vector search results with their 1-based ranks
  vectorRows.forEach((row, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (rrfConstant + rank);

    chunkMap.set(row.id, {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      pageNumber: row.page_number,
      chunkIndex: row.chunk_index,
      vectorRank: rank,
      vectorSimilarity: row.similarity,
      fusedScore: rrfScore,
    });
  });

  // Add keyword search results, fusing scores for chunks appearing in both
  keywordRows.forEach((row, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (rrfConstant + rank);

    if (chunkMap.has(row.id)) {
      const existing = chunkMap.get(row.id)!;
      existing.keywordRank = rank;
      existing.keywordRankScore = row.rank;
      existing.fusedScore += rrfScore; // Fused combination!
    } else {
      chunkMap.set(row.id, {
        id: row.id,
        documentId: row.document_id,
        content: row.content,
        pageNumber: row.page_number,
        chunkIndex: row.chunk_index,
        keywordRank: rank,
        keywordRankScore: row.rank,
        fusedScore: rrfScore,
      });
    }
  });

  // 3. Sort all chunks by fusedScore descending
  const sortedChunks = Array.from(chunkMap.values()).sort(
    (a, b) => b.fusedScore - a.fusedScore
  );

  const topChunks = sortedChunks.slice(0, finalTopK);
  const topFusedScore = topChunks.length > 0 ? topChunks[0].fusedScore : 0;

  // Grounded refusal check:
  // If no chunks were returned, or top fused score is below threshold
  const hasSufficientContext =
    topChunks.length > 0 &&
    (topFusedScore >= confidenceThreshold ||
      (topChunks[0].vectorSimilarity !== undefined && topChunks[0].vectorSimilarity > 0.45));

  return {
    chunks: topChunks,
    hasSufficientContext,
    topFusedScore,
    totalVectorMatches: vectorRows.length,
    totalKeywordMatches: keywordRows.length,
  };
}
