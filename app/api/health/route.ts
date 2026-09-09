import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const results: Record<string, any> = {
    supabaseConnection: false,
    storageBucket: false,
    schemaTablesReady: false,
    geminiApiReady: false,
    details: {},
  };

  // 1. Supabase Connection & Table Check
  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('count')
      .limit(1);

    if (!error) {
      results.supabaseConnection = true;
      results.schemaTablesReady = true;
      results.details.documentsTable = 'OK';
    } else if (error.code === 'PGRST205') {
      results.supabaseConnection = true;
      results.schemaTablesReady = false;
      results.details.documentsTable = 'Table missing. Please run schema.sql.';
    } else {
      results.details.documentsTable = error.message;
    }
  } catch (err: any) {
    results.details.supabaseError = err.message;
  }

  // 2. Storage Bucket Check
  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (!error && buckets) {
      const hasDocuments = buckets.some((b) => b.name === 'documents');
      results.storageBucket = hasDocuments;
      results.details.storageBucket = hasDocuments ? 'Bucket "documents" is ready' : 'Bucket missing';
    }
  } catch (err: any) {
    results.details.storageError = err.message;
  }

  // 3. AI & LLM Services Check (Groq, Gemini, OpenRouter)
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);

  const aiReady = hasGemini || hasGroq || hasOpenRouter;
  results.aiServicesReady = aiReady;
  results.geminiApiReady = aiReady; // maintain backward compatibility
  results.details.aiServices = aiReady ? 'AI & LLM Services active' : 'No AI API keys configured';

  const allOperational =
    results.supabaseConnection &&
    results.storageBucket &&
    results.schemaTablesReady &&
    results.aiServicesReady;

  return NextResponse.json({
    status: allOperational ? 'healthy' : 'setup_required',
    allOperational,
    checks: results,
    supabaseProjectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    timestamp: new Date().toISOString(),
  });
}
