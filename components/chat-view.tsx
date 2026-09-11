'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  User,
  RotateCcw,
  ShieldCheck,
  Layers,
  Paperclip,
  ArrowUp,
  FileText,
  X,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { CitationBadge } from './citation-badge';
import { SourceCitation } from '@/lib/rag/llm-stream';
import { DocumentItem } from './document-list';
import { MarkdownRenderer } from './markdown-renderer';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  rewrittenQuery?: string | null;
  isStreaming?: boolean;
  provider?: string;
}

interface ChatViewProps {
  selectedDoc: DocumentItem | null;
  documents: DocumentItem[];
  onOpenUpload: () => void;
  onOpenSidebar?: () => void;
  onClearSelectedDoc?: () => void;
}

/**
 * Deduplicates consecutive identical [Page X] citation tags across adjacent sentences.
 */
function cleanRedundantCitations(text: string): string {
  if (!text) return text;
  let cleaned = text;

  // 1. Collapse immediate duplicate tags like [Page 1] [Page 1] or [Page 1], [Page 1]
  cleaned = cleaned.replace(/\[Page\s+(\d+)\](?:\s*,\s*|\s+)\[Page\s+\1\]/gi, '[Page $1]');

  // 2. Collapse consecutive sentences citing the exact same page number
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(
      /\s*\[Page\s+(\d+)\](\s*[\.\,\;]?\s*)([^\[\n]{1,400}?)\s*\[Page\s+\1\]/gi,
      (_match, p1, p2, p3) => {
        const punct = p2.trim();
        return (punct ? punct + ' ' : ' ') + p3.trim() + ' [Page ' + p1 + ']';
      }
    );
  }
  return cleaned;
}

export function ChatView({
  selectedDoc,
  documents,
  onOpenUpload,
  onOpenSidebar,
  onClearSelectedDoc,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputQuestion).trim();
    if (!textToSend || isLoading) return;

    setInputQuestion('');
    const userMessageId = 'user-' + Date.now();
    const assistantMessageId = 'assistant-' + Date.now();

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMessageId, role: 'user', content: textToSend },
      { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true, sources: [] },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Build history of recent turns (exclude current prompt)
      const historyPayload = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          documentId: selectedDoc?.id || null,
          conversationId,
          history: historyPayload,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No stream body received');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '');

          if (dataStr === '[DONE]') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId ? { ...m, isStreaming: false } : m
              )
            );
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === 'metadata') {
              if (parsed.conversationId) {
                setConversationId(parsed.conversationId);
              }
              if (parsed.rewrittenQuery) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, rewrittenQuery: parsed.rewrittenQuery }
                      : m
                  )
                );
              }
            } else if (parsed.type === 'token') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            } else if (parsed.type === 'provider') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, provider: parsed.content }
                    : m
                )
              );
            } else if (parsed.type === 'sources') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, sources: parsed.sources || [] }
                    : m
                )
              );
            } else if (parsed.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                      ...m,
                      content: parsed.content || 'AI service is temporarily unavailable. Please try again.',
                      isStreaming: false,
                    }
                    : m
                )
              );
            }
          } catch {
            // Ignore partial SSE chunk parses
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
              ...m,
              content: `Error: ${err.message || 'Failed to generate response.'}`,
              isStreaming: false,
            }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId ? { ...m, isStreaming: false } : m
        )
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  return (
    <div className="flex flex-col h-full ambient-canvas relative overflow-hidden">
      {/* Messages Thread or Hero Canvas */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        {messages.length === 0 ? (
          /* Zero State: Centered Hero (Gemini & Arena style) */
          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 max-w-2xl mx-auto animate-in fade-in duration-300">
            {/* Editorial Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif-display font-normal text-slate-100 tracking-tight text-center mb-3">
              Where should we start?
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 text-center mb-8 max-w-md">
              {selectedDoc
                ? `Researching "${selectedDoc.name}"`
                : 'Explore and research insights across your document library.'}
            </p>

            {/* Centered Floating Input Bar */}
            <div className="w-full bg-[#13151b] border border-white/[0.09] hover:border-white/[0.15] focus-within:border-indigo-500/50 rounded-3xl p-3 sm:p-4 input-pill-shadow transition-all">
              <textarea
                ref={textareaRef}
                rows={2}
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedDoc
                    ? `Ask anything about ${selectedDoc.name}...`
                    : 'Ask anything about your documents...'
                }
                className="w-full bg-transparent border-0 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.05] mt-1">
                {/* Left: Attach & Scope */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenUpload}
                    className="p-1.5 rounded-full hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 text-xs cursor-pointer"
                    title="Upload PDF document"
                  >
                    <Paperclip className="w-4 h-4 text-slate-400" />
                    <span className="hidden sm:inline text-slate-400">Add PDF</span>
                  </button>

                  {selectedDoc ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[11px] text-indigo-300">
                      <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="max-w-[120px] sm:max-w-[180px] truncate">{selectedDoc.name}</span>
                      {onClearSelectedDoc && (
                        <button
                          onClick={onClearSelectedDoc}
                          className="hover:text-white transition-colors ml-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-400">
                      <span>All Documents</span>
                    </div>
                  )}
                </div>

                {/* Right: Model Tag & Submit */}
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 px-2 py-0.5 rounded-full bg-white/[0.03]">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    Flash
                  </span>

                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputQuestion.trim() || isLoading}
                    className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:hover:bg-indigo-600 flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0"
                    title="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Active Chat Thread */
          <div className="max-w-3xl mx-auto py-6 sm:py-8 space-y-6">
            {/* Thread Header Control */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] text-xs text-slate-400">
              <div className="flex items-center gap-2">
                {onOpenSidebar && (
                  <button
                    onClick={onOpenSidebar}
                    className="lg:hidden p-1 text-slate-400 hover:text-white"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                )}
                <span className="text-slate-300 font-medium">
                  {selectedDoc ? selectedDoc.name : 'Research across all documents'}
                </span>
              </div>

              <button
                onClick={handleClearChat}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>New Session</span>
              </button>
            </div>

            {/* Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`space-y-2 max-w-2xl select-text ${msg.role === 'user'
                    ? 'bg-[#1a1d26] border border-white/[0.08] text-slate-100 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm'
                    : 'text-slate-200 text-sm leading-relaxed min-w-0 flex-1'
                    }`}
                >
                  <div className="select-text">
                    {msg.role === 'assistant' ? (
                      <div className="relative">
                        {!msg.content && msg.isStreaming ? (
                          <div className="flex items-center gap-2 text-indigo-400/80 py-1">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-medium animate-pulse">Researching context...</span>
                          </div>
                        ) : (
                          <>
                            <MarkdownRenderer content={cleanRedundantCitations(msg.content)} />
                            {msg.isStreaming && (
                              <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 animate-pulse rounded-full align-middle" />
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    )}
                  </div>

                  {/* Assistant Footer: Sources & Copy Action */}
                  {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                    <div className="pt-2 flex items-center justify-between gap-2 flex-wrap border-t border-white/[0.06] mt-3">
                      {/* Grounded Citation Chips */}
                      {msg.sources && msg.sources.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            Verified Sources:
                          </span>
                          {/* Deduplicate citations by page number so each page shows once */}
                          {Array.from(
                            new Map(msg.sources.map((s) => [s.pageNumber, s])).values()
                          ).map((cit, idx) => (
                            <CitationBadge key={idx} citation={cit} />
                          ))}
                        </div>
                      ) : (
                        <div />
                      )}

                      {/* One-Click Copy Button */}
                      <button
                        onClick={() => handleCopy(msg.id, cleanRedundantCitations(msg.content))}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 px-2.5 rounded-lg hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.08] cursor-pointer shrink-0 ml-auto select-none"
                        title="Copy response to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium text-[11px]">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[11px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 text-xs font-semibold mt-0.5 border border-white/[0.08]">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} className="h-20" />
          </div>
        )}
      </div>

      {/* Floating Bottom Input Bar (Active Chat State) */}
      {messages.length > 0 && (
        <div className="p-3 sm:p-4 border-t border-white/[0.06] bg-[#0c0e14]/80 backdrop-blur-xl shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="bg-[#13151b] border border-white/[0.09] hover:border-white/[0.15] focus-within:border-indigo-500/50 rounded-2xl px-3 sm:px-4 py-2 input-pill-shadow transition-all flex items-center gap-2">
              <button
                onClick={onOpenUpload}
                className="p-1.5 rounded-full hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer shrink-0"
                title="Upload PDF document"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedDoc
                    ? `Ask about ${selectedDoc.name}...`
                    : 'Ask a follow-up question...'
                }
                className="flex-1 bg-transparent border-0 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none max-h-32 py-1 leading-normal"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={!inputQuestion.trim() || isLoading}
                className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0"
                title="Send query"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                )}
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-500 mt-2">
              Raphael verifies claims against uploaded PDF pages. Click citations to inspect source context.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
