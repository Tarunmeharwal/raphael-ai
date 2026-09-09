'use client';

import React, { useState } from 'react';
import { FileText, X, BookOpen, CheckCircle2, Copy, Check } from 'lucide-react';
import { SourceCitation } from '@/lib/rag/llm-stream';

interface CitationBadgeProps {
  citation: SourceCitation;
}

export function CitationBadge({ citation }: CitationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(citation.snippet);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy snippet:', err);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 hover:border-indigo-500/40 transition-all cursor-pointer"
        title="View source snippet and page"
      >
        <BookOpen className="w-3 h-3 text-indigo-400" />
        <span>Page {citation.pageNumber}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-[#13151c] border border-white/[0.1] rounded-2xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-white/[0.06] bg-[#0c0e14]/60 shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <h3 className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-[280px]">
                  {citation.documentName}
                </h3>
              </div>
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                  Page {citation.pageNumber}
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Verbatim Source Passages
                  </p>
                  <button
                    onClick={handleCopySnippet}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-0.5 px-2 rounded hover:bg-white/[0.06] cursor-pointer"
                    title="Copy passage to clipboard"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy snippet</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] text-xs sm:text-sm text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap font-sans select-text">
                  {citation.snippet}
                </div>
              </div>

              {/* Footer status */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/[0.06]">
                <span>
                  Match Relevance:{' '}
                  <strong className="text-emerald-400 font-semibold">
                    {citation.similarity
                      ? `${(citation.similarity * 100).toFixed(1)}%`
                      : citation.fusedScore
                        ? `RRF ${citation.fusedScore.toFixed(4)}`
                        : 'High'}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Verified Context
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
