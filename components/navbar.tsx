'use client';

import React from 'react';
import {
  Sparkles,
  Upload,
  BarChart3,
  PanelLeftClose,
  PanelLeft,
  FileText,
  X,
  Database,
  Loader2,
} from 'lucide-react';

interface NavbarProps {
  onOpenUpload: () => void;
  onOpenEvaluation: () => void;
  onOpenStatus: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  selectedDocName?: string | null;
  onClearSelectedDoc?: () => void;
  schemaReady?: boolean;
  isChecking?: boolean;
}

export function Navbar({
  onOpenUpload,
  onOpenEvaluation,
  onOpenStatus,
  onToggleSidebar,
  isSidebarOpen = true,
  selectedDocName = null,
  onClearSelectedDoc,
  schemaReady = true,
  isChecking = false,
}: NavbarProps) {
  return (
    <header className="h-14 border-b border-white/[0.06] bg-[#0c0e14]/90 backdrop-blur-md px-3 sm:px-5 flex items-center justify-between z-30 shrink-0 gap-3">
      {/* Left section: Sidebar toggle & Scope pill */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
            title={isSidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
            aria-label="Toggle sidebar"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Brand (Shown when sidebar is collapsed or on mobile) */}
        <div className={`flex items-center gap-2 ${isSidebarOpen ? 'lg:hidden' : 'flex'}`}>
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">
            Raphael
          </span>
        </div>

        {/* Document Scope Pill (Arena.ai / Gemini model pill style) */}
        <div className="hidden sm:flex items-center">
          {selectedDocName ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-xs text-indigo-200 max-w-xs truncate">
              <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="truncate">{selectedDocName}</span>
              {onClearSelectedDoc && (
                <button
                  onClick={onClearSelectedDoc}
                  className="p-0.5 hover:text-white rounded-full hover:bg-indigo-900/50 transition-colors ml-0.5 cursor-pointer"
                  title="Clear document filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>All Documents</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Action Pills */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Schema alert if needed */}
        {!schemaReady && (
          <button
            onClick={onOpenStatus}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <Database className="w-3 h-3" />
            <span className="hidden sm:inline">Setup Schema</span>
          </button>
        )}

        {/* Evaluation Suite (Gemini "Upgrade" / Arena pill style) */}
        <button
          onClick={onOpenEvaluation}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white text-xs font-medium border border-white/[0.08] transition-all cursor-pointer"
          title="Run RAG benchmark tests"
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Evaluation Suite</span>
          <span className="sm:hidden">Eval</span>
        </button>

        {/* System Health / Diagnostics Button */}
        <button
          onClick={onOpenStatus}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white text-xs font-medium border border-white/[0.08] transition-all cursor-pointer"
          title="System Health & Diagnostics"
        >
          {isChecking ? (
            <>
              <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
              <span className="hidden md:inline text-slate-400">Checking...</span>
            </>
          ) : !schemaReady ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="hidden md:inline text-amber-300">Action Needed</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden md:inline text-slate-400">System Ready</span>
            </>
          )}
        </button>

        {/* Upload Button */}
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Upload PDF</span>
        </button>
      </div>
    </header>
  );
}
