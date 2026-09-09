'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  CheckCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  RefreshCw,
  Server,
  Zap,
  HardDrive,
  HeartHandshake,
  Loader2,
} from 'lucide-react';

interface SystemStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshParent?: () => void;
}

export function SystemStatusModal({ isOpen, onClose, onRefreshParent }: SystemStatusModalProps) {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [keepAliveResult, setKeepAliveResult] = useState<any>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
    } catch (err: any) {
      console.error('Failed to load health:', err);
      setFetchError(err.message || 'Failed to check system health');
    } finally {
      setLoading(false);
    }
  };

  const pingKeepAlive = async () => {
    setIsPinging(true);
    try {
      const res = await fetch('/api/keep-alive');
      const data = await res.json();
      setKeepAliveResult(data);
    } catch (err: any) {
      setKeepAliveResult({ status: 'error', message: err.message });
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let projectId = 'Supabase';
  try {
    if (supabaseUrl) {
      projectId = new URL(supabaseUrl).hostname.split('.')[0];
    }
  } catch {}

  if (!isOpen) return null;

  const handleCopySchema = async () => {
    try {
      // Fetch schema.sql directly or copy template
      const sqlContent = `-- Raphael Schema (Run in Supabase SQL Editor)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE INDEX IF NOT EXISTS idx_documents_org_id ON public.documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv ON public.document_chunks USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

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

INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_anon_documents ON public.documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_chunks ON public.document_chunks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_conversations ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_messages ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_sources ON public.message_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_orgs ON public.organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_members ON public.organization_members FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true) ON CONFLICT (id) DO UPDATE SET public = true;
`;

      await navigator.clipboard.writeText(sqlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
    }
  };

  const isInitialLoading = loading && !health;
  const isChecking = loading || (!health && !fetchError);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-[#13151c] border border-white/[0.1] rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.06] bg-[#0c0e14]/60 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-xs sm:text-sm truncate">System Diagnostics & Setup</h3>
                {isInitialLoading ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[10px] font-medium">
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                    <span>Checking...</span>
                  </span>
                ) : health?.allOperational ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>All Operational</span>
                  </span>
                ) : health ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-medium">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                    <span>Attention Needed</span>
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Project: <code className="text-cyan-400">{projectId}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Global error banner if health API endpoint fails */}
          {fetchError && !health && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between gap-3 text-xs text-rose-300">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="truncate">Diagnostics check failed: {fetchError}</span>
              </div>
              <button
                onClick={fetchHealth}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium transition-colors cursor-pointer shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Health status cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. PostgreSQL / Auth */}
            <div
              className={`p-3.5 rounded-xl transition-all space-y-1 ${
                isInitialLoading
                  ? 'bg-[#090a0e] border border-white/[0.06]'
                  : health?.checks?.supabaseConnection
                  ? 'bg-[#090a0e] border border-emerald-500/20 shadow-[0_0_12px_-4px_rgba(16,185,129,0.1)]'
                  : 'bg-rose-950/15 border border-rose-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">PostgreSQL / Auth</span>
                <Database className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {isInitialLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-xs font-medium text-slate-400 animate-pulse">Checking...</span>
                  </>
                ) : health?.checks?.supabaseConnection ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-200">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-semibold text-rose-300">Unreachable</span>
                  </>
                )}
              </div>
            </div>

            {/* 2. Storage Bucket */}
            <div
              className={`p-3.5 rounded-xl transition-all space-y-1 ${
                isInitialLoading
                  ? 'bg-[#090a0e] border border-white/[0.06]'
                  : health?.checks?.storageBucket
                  ? 'bg-[#090a0e] border border-emerald-500/20 shadow-[0_0_12px_-4px_rgba(16,185,129,0.1)]'
                  : 'bg-amber-950/15 border border-amber-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Storage Bucket</span>
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {isInitialLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-xs font-medium text-slate-400 animate-pulse">Checking...</span>
                  </>
                ) : health?.checks?.storageBucket ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-200">&quot;documents&quot; Ready</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-300">Bucket Missing</span>
                  </>
                )}
              </div>
            </div>

            {/* 3. AI & LLM Services */}
            <div
              className={`p-3.5 rounded-xl transition-all space-y-1 ${
                isInitialLoading
                  ? 'bg-[#090a0e] border border-white/[0.06]'
                  : (health?.checks?.aiServicesReady ?? health?.checks?.geminiApiReady)
                  ? 'bg-[#090a0e] border border-emerald-500/20 shadow-[0_0_12px_-4px_rgba(16,185,129,0.1)]'
                  : 'bg-rose-950/15 border border-rose-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">AI & LLM Services</span>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {isInitialLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-xs font-medium text-slate-400 animate-pulse">Checking...</span>
                  </>
                ) : (health?.checks?.aiServicesReady ?? health?.checks?.geminiApiReady) ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-200">Active</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-semibold text-rose-300">Key Issue</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Database Schema Setup Callout */}
          <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-indigo-200 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span>Database Schema & pgvector Setup</span>
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  To initialize the vector database, tables, full-text indexes, and RPC search functions, open the Supabase SQL editor and run the generated SQL migration.
                </p>
              </div>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5 shrink-0 ${
                  isInitialLoading
                    ? 'text-slate-400 bg-white/[0.04] border-white/[0.08]'
                    : health?.checks?.schemaTablesReady
                    ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30'
                    : 'text-amber-400 bg-amber-950/60 border-amber-500/30'
                }`}
              >
                {isInitialLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                    <span>Checking schema...</span>
                  </>
                ) : health?.checks?.schemaTablesReady ? (
                  'Schema Ready'
                ) : (
                  'Action Required'
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={handleCopySchema}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'SQL Copied to Clipboard!' : 'Copy schema.sql (1-Click)'}</span>
              </button>

              <a
                href={projectId && projectId !== 'Supabase' ? `https://supabase.com/dashboard/project/${projectId}/sql/new` : 'https://supabase.com/dashboard'}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-all border border-slate-700"
              >
                <span>Open Supabase SQL Editor</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>

              <button
                onClick={() => {
                  fetchHealth();
                  if (onRefreshParent) onRefreshParent();
                }}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-slate-900 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-slate-800 transition-colors ml-auto cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Verify Schema</span>
              </button>
            </div>
          </div>

          {/* Supabase Free-Tier Keep-Alive Ping */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-cyan-400" />
                <h5 className="text-xs font-semibold text-slate-200">Supabase 7-Day Inactivity Prevention</h5>
              </div>
              <button
                onClick={pingKeepAlive}
                disabled={isPinging}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPinging && <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />}
                <span>{isPinging ? 'Pinging...' : 'Send Ping Now'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Supabase pauses inactive free projects after 7 days. Our automated GitHub Actions workflow keeps the database active by pinging <code className="text-slate-300">/api/keep-alive</code> every 3 days.
            </p>
            {keepAliveResult && (
              <div className="text-[11px] text-emerald-400 bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                Ping Status: {keepAliveResult.status} ({keepAliveResult.latencyMs}ms) • Database Active!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
