-- ==============================================================================
-- DocuMind AI — Multi-Tenant PostgreSQL Schema with pgvector & Full-Text Search
-- Compatible with Supabase SQL Editor
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Organizations & Multi-Tenancy
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

-- 3. Documents
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT DEFAULT 0,
    total_pages INT DEFAULT 0,
    chunk_count INT DEFAULT 0,
    status TEXT CHECK (status IN ('pending', 'processing', 'processed', 'failed')) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Document Chunks (pgvector 768 dimensions for Gemini Embeddings + tsvector)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    page_number INT NOT NULL,
    chunk_index INT NOT NULL,
    token_count INT,
    embedding VECTOR(768),
    tsv TSVECTOR,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Conversations & Messages
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Message Citations / Sources
CREATE TABLE IF NOT EXISTS public.message_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES public.document_chunks(id) ON DELETE SET NULL,
    document_name TEXT,
    page_number INT NOT NULL,
    chunk_index INT,
    snippet TEXT,
    similarity FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. High Performance Indexes
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON public.documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_sources_message_id ON public.message_sources(message_id);

-- GIN Index for rapid Full-Text Search
CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv ON public.document_chunks USING GIN(tsv);

-- HNSW Vector Index for sub-millisecond Cosine Similarity Search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON public.document_chunks 
USING hnsw (embedding vector_cosine_ops);

-- 8. Auto-update TSVECTOR on Chunks Insert/Update
CREATE OR REPLACE FUNCTION public.document_chunks_tsv_trigger() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.tsv := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_chunks_tsv ON public.document_chunks;
CREATE TRIGGER trg_document_chunks_tsv
BEFORE INSERT OR UPDATE ON public.document_chunks
FOR EACH ROW EXECUTE FUNCTION public.document_chunks_tsv_trigger();

-- 9. RPC Function: Vector Similarity Search
CREATE OR REPLACE FUNCTION public.match_chunks_vector(
  query_embedding VECTOR(768),
  filter_document_id UUID DEFAULT NULL,
  filter_org_id UUID DEFAULT NULL,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  page_number INT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.page_number,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE
    (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    AND (filter_org_id IS NULL OR dc.organization_id = filter_org_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 10. RPC Function: Full-Text Keyword Search
CREATE OR REPLACE FUNCTION public.match_chunks_keyword(
  query_text TEXT,
  filter_document_id UUID DEFAULT NULL,
  filter_org_id UUID DEFAULT NULL,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  page_number INT,
  chunk_index INT,
  rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.page_number,
    dc.chunk_index,
    ts_rank(dc.tsv, websearch_to_tsquery('english', query_text))::float8 AS rank
  FROM public.document_chunks dc
  WHERE
    (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    AND (filter_org_id IS NULL OR dc.organization_id = filter_org_id)
    AND dc.tsv @@ websearch_to_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- 11. Default Organization and Demo Seed
INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace')
ON CONFLICT (id) DO NOTHING;

-- 12. Enable Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_sources ENABLE ROW LEVEL SECURITY;

-- Allow public / anon read/write policies for demo/dev access (service_role has full bypass)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_documents') THEN
        CREATE POLICY allow_anon_documents ON public.documents FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_chunks') THEN
        CREATE POLICY allow_anon_chunks ON public.document_chunks FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_conversations') THEN
        CREATE POLICY allow_anon_conversations ON public.conversations FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_messages') THEN
        CREATE POLICY allow_anon_messages ON public.messages FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_sources') THEN
        CREATE POLICY allow_anon_sources ON public.message_sources FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_orgs') THEN
        CREATE POLICY allow_anon_orgs ON public.organizations FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_members') THEN
        CREATE POLICY allow_anon_members ON public.organization_members FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

-- 13. Storage Bucket Configuration for Documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_storage_select') THEN
        CREATE POLICY allow_anon_storage_select ON storage.objects FOR SELECT USING (bucket_id = 'documents');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_anon_storage_insert') THEN
        CREATE POLICY allow_anon_storage_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
    END IF;
END
$$;

