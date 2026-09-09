'use client';

import React, { useState } from 'react';
import { X, Play, CheckCircle2, XCircle, Gauge, Shield, Clock, Award, Loader2 } from 'lucide-react';

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EvaluationModal({ isOpen, onClose }: EvaluationModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunEvaluation = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const res = await fetch('/api/evaluate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Evaluation failed to complete');
      }
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || 'Error running evaluation suite');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-[#13151c] border border-white/[0.1] rounded-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.06] bg-[#0c0e14]/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm sm:text-base text-slate-100 truncate">
                Evaluation & Accuracy Benchmarks
              </h3>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Measures retrieval hit-rate, page citation accuracy, refusal correctness & latency
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Action banner */}
          <div className="p-5 rounded-2xl bg-[#090a0e] border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">
                Run Automated Benchmark Suite
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
                Executes synthetic and factual evaluation pairs against the hybrid retrieval pipeline and measures empirical accuracy.
              </p>
            </div>
            <button
              onClick={handleRunEvaluation}
              disabled={isRunning}
              className="px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer shrink-0"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Evaluation</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Metric Cards if Report exists */}
          {report ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Retrieval Accuracy</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-100">
                    {report.retrievalAccuracy.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-emerald-400">Top-6 Reciprocal Rank Fusion</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Citation Accuracy</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-100">
                    {report.citationAccuracy.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-slate-400">Page-level validation</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Grounded Refusal</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-100">
                    {report.groundedRefusalRate.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-slate-400">Zero-hallucination rate</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Avg Latency</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-100">
                    {report.avgLatencyMs} <span className="text-xs font-normal text-slate-400">ms</span>
                  </p>
                  <p className="text-[10px] text-slate-400">Embedding + hybrid query</p>
                </div>
              </div>

              {/* Per-question detailed list */}
              <div className="space-y-2">
                <h5 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Detailed Test Cases ({report.results.length})
                </h5>
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/60 bg-slate-950/40 text-xs">
                  {report.results.map((res: any) => (
                    <div key={res.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {res.id}
                          </span>
                          <span className="text-slate-200 font-medium truncate max-w-md">
                            {res.question}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span>
                            Type: {res.isOutOfScope ? 'Out-of-Scope (Guard)' : 'Factual Retrieval'}
                          </span>
                          <span>•</span>
                          <span>Retrieved: {res.retrievedCount} chunks</span>
                          <span>•</span>
                          <span>Latency: {res.latencyMs}ms</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {(res.isOutOfScope ? res.refusalSuccess : res.retrievalSuccess) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-400 bg-red-950/60 px-2 py-0.5 rounded-full border border-red-500/30">
                            <XCircle className="w-3 h-3" />
                            Fail
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 space-y-2">
              <Award className="w-10 h-10 mx-auto text-slate-700" />
              <p className="text-xs">No evaluation has been executed in this session.</p>
              <p className="text-[11px] text-slate-400">
                Click &ldquo;Execute Evaluation&rdquo; above to run the 5-point benchmark.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
