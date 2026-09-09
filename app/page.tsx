'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/navbar';
import { DocumentList, DocumentItem } from '@/components/document-list';
import { ChatView } from '@/components/chat-view';
import { UploadModal } from '@/components/upload-modal';
import { EvaluationModal } from '@/components/evaluation-modal';
import { SystemStatusModal } from '@/components/system-status-modal';
import { AlertTriangle, Database, ArrowRight } from 'lucide-react';

export default function HomePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEvalOpen, setIsEvalOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [loading, setLoading] = useState(true);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [chatSessionKey, setChatSessionKey] = useState(0);

  const handleNewSession = () => {
    setSelectedDocId(null);
    setChatSessionKey((prev) => prev + 1);
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
      if (data.schemaReady !== undefined) {
        setSchemaReady(data.schemaReady);
      }
    } catch (err) {
      console.error('Failed fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDeleteDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        if (selectedDocId === id) {
          setSelectedDocId(null);
        }
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const handleProcessDocument = async (id: string) => {
    try {
      // Optimistic update
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: 'processing' } : d))
      );
      const res = await fetch(`/api/documents/${id}/process`, { method: 'POST' });
      const data = await res.json();
      if (data.document) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === id ? data.document : d))
        );
      } else {
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Error processing document:', err);
      await fetchDocuments();
    }
  };

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setIsDesktopSidebarOpen((prev) => !prev);
    } else {
      setIsMobileSidebarOpen((prev) => !prev);
    }
  };

  const activeDoc = documents.find((d) => d.id === selectedDocId) || null;

  return (
    <main className="flex flex-col h-screen w-screen bg-[#0b0c10] text-[#e3e5e8] overflow-hidden font-sans">
      {/* Top Navigation */}
      <Navbar
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenEvaluation={() => setIsEvalOpen(true)}
        onOpenStatus={() => setIsStatusOpen(true)}
        onToggleSidebar={handleToggleSidebar}
        isSidebarOpen={isDesktopSidebarOpen}
        selectedDocName={activeDoc?.name || null}
        onClearSelectedDoc={() => setSelectedDocId(null)}
        schemaReady={schemaReady}
        isChecking={loading}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Left Sidebar: Documents (280px) */}
        {isDesktopSidebarOpen && (
          <aside className="hidden lg:block w-72 shrink-0 h-full transition-all duration-200">
            <DocumentList
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDoc={setSelectedDocId}
              onOpenUpload={() => setIsUploadOpen(true)}
              onRefresh={fetchDocuments}
              onDelete={handleDeleteDocument}
              onProcess={handleProcessDocument}
              onNewChat={handleNewSession}
              onOpenStatus={() => setIsStatusOpen(true)}
              onOpenEvaluation={() => setIsEvalOpen(true)}
            />
          </aside>
        )}

        {/* Mobile/Tablet Off-Canvas Slide-Over Drawer */}
        {isMobileSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer Content */}
            <div className="relative z-50 w-72 max-w-[85vw] h-full shadow-2xl bg-[#101217] animate-in slide-in-from-left duration-200">
              <DocumentList
                documents={documents}
                selectedDocId={selectedDocId}
                onSelectDoc={(id) => {
                  setSelectedDocId(id);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenUpload={() => {
                  setIsMobileSidebarOpen(false);
                  setIsUploadOpen(true);
                }}
                onRefresh={fetchDocuments}
                onDelete={handleDeleteDocument}
                onProcess={handleProcessDocument}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
                onNewChat={() => {
                  handleNewSession();
                  setIsMobileSidebarOpen(false);
                }}
                onOpenStatus={() => {
                  setIsMobileSidebarOpen(false);
                  setIsStatusOpen(true);
                }}
                onOpenEvaluation={() => {
                  setIsMobileSidebarOpen(false);
                  setIsEvalOpen(true);
                }}
              />
            </div>
          </div>
        )}

        {/* Main Panel: Conversational Workspace */}
        <section className="flex-1 h-full min-w-0">
          <ChatView
            key={chatSessionKey}
            selectedDoc={activeDoc}
            documents={documents}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenSidebar={() => setIsMobileSidebarOpen(true)}
            onClearSelectedDoc={() => setSelectedDocId(null)}
          />
        </section>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={(newDoc) => {
          fetchDocuments();
          setSelectedDocId(newDoc.id);
          setIsMobileSidebarOpen(false);
        }}
      />

      <EvaluationModal
        isOpen={isEvalOpen}
        onClose={() => setIsEvalOpen(false)}
      />

      <SystemStatusModal
        isOpen={isStatusOpen}
        onClose={() => setIsStatusOpen(false)}
        onRefreshParent={fetchDocuments}
      />
    </main>
  );
}
