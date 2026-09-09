'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Sparkles,
  Settings,
  X,
  Compass,
  BarChart3,
} from 'lucide-react';

export interface DocumentItem {
  id: string;
  name: string;
  file_size: number;
  total_pages: number;
  chunk_count: number;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  error_message?: string;
  created_at: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  selectedDocId: string | null;
  onSelectDoc: (id: string | null) => void;
  onOpenUpload: () => void;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<void>;
  onProcess: (id: string) => Promise<void>;
  onCloseMobile?: () => void;
  onNewChat?: () => void;
  onOpenStatus?: () => void;
  onOpenEvaluation?: () => void;
}

export function DocumentList({
  documents,
  selectedDocId,
  onSelectDoc,
  onOpenUpload,
  onRefresh,
  onDelete,
  onProcess,
  onCloseMobile,
  onNewChat,
  onOpenStatus,
  onOpenEvaluation,
}: DocumentListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this document and its embeddings?')) {
      setDeletingId(id);
      await onDelete(id);
      setDeletingId(null);
    }
  };

  const handleProcess = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingId(id);
    await onProcess(id);
    setProcessingId(null);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="flex flex-col h-full bg-[#101217] border-r border-white/[0.06]">
      {/* Brand & Sidebar Header */}
      <div className="h-14 px-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base tracking-tight text-white">
            Raphael
          </span>
        </div>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New Research Button (Gemini "New chat" style) */}
      <div className="p-3">
        <button
          onClick={() => {
            if (onNewChat) onNewChat();
            else onSelectDoc(null);
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full py-2.5 px-3.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/[0.14] text-slate-200 hover:text-white text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm cursor-pointer group"
        >
          <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>New research session</span>
        </button>
      </div>

      {/* Search & Library Section Header */}
      <div className="px-3 pb-2 pt-1 flex items-center justify-between text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
        <span>Library</span>
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 normal-case font-medium text-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Upload PDF</span>
        </button>
      </div>

      {/* Search filter input */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/[0.03] border border-white/[0.06] focus:border-indigo-500/50 rounded-xl text-slate-200 placeholder-slate-400 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* All Documents Scope Item */}
      <div className="px-2 pb-1">
        <button
          onClick={() => {
            onSelectDoc(null);
            if (onCloseMobile) onCloseMobile();
          }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${selectedDocId === null
            ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
        >
          <div className="flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-indigo-400" />
            <span>All Documents</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">
            {documents.length}
          </span>
        </button>
      </div>

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="w-9 h-9 rounded-2xl bg-white/[0.03] border border-white/[0.06] mx-auto flex items-center justify-center text-slate-400 mb-2.5">
              <FileText className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-slate-400">No documents yet</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Upload a PDF to research and query.
            </p>
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isSelected = selectedDocId === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => {
                  onSelectDoc(doc.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`group px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${isSelected
                  ? 'bg-indigo-600/15 border-indigo-500/40 text-slate-100 shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-white/[0.04] text-slate-300'
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FileText
                      className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'
                        }`}
                    />
                    <div className="min-w-0">
                      <h4
                        className="text-xs font-medium truncate"
                        title={doc.name}
                      >
                        {doc.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>{doc.total_pages || 1} {doc.total_pages === 1 ? 'page' : 'pages'}</span>
                        <span>•</span>
                        <span>{formatFileSize(doc.file_size)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions on hover */}
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.status === 'failed' && (
                      <button
                        onClick={(e) => handleProcess(doc.id, e)}
                        disabled={processingId === doc.id}
                        className="p-1 text-amber-400 hover:text-amber-300 transition-colors"
                        title="Retry processing"
                      >
                        <RefreshCw className={`w-3 h-3 ${processingId === doc.id ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(doc.id, e)}
                      disabled={deletingId === doc.id}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Settings Footer (ChatGPT / Linear style) */}
      <div className="p-2 border-t border-white/[0.06] bg-[#0c0e14]/70 relative" ref={menuRef}>
        {/* Floating Settings Popover Menu */}
        {isMenuOpen && (
          <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 bg-[#141721] border border-white/[0.1] rounded-2xl shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-0.5">
              {onOpenStatus && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenStatus();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>System Diagnostics & Setup</span>
                </button>
              )}

              {onOpenEvaluation && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenEvaluation();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span>RAG Evaluation Suite</span>
                </button>
              )}

              {onNewChat && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onNewChat();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <span>New Research Session</span>
                </button>
              )}

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onRefresh();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-slate-400" />
                <span>Sync & Refresh Documents</span>
              </button>
            </div>
          </div>
        )}

        {/* Full-width Settings Button (ChatGPT / Linear style) */}
        <button
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${isMenuOpen
              ? 'bg-white/[0.08] text-white shadow-sm ring-1 ring-white/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          title="Open Settings Menu"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
