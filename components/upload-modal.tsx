'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, FileText, AlertCircle, Loader2, StopCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (document: any) => void;
}

export function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  if (!isOpen) return null;

  const isActive = uploading || processing;

  const handleCancel = () => {
    if (isActive && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploading(false);
    setProcessing(false);
    setProgressStatus('');
    setErrorMessage(null);
    setSelectedFile(null);
    onClose();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('File exceeds the 20MB limit. Please upload a smaller PDF.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setUploading(true);
    setErrorMessage(null);
    setProgressStatus('Uploading PDF to secure storage...');

    try {
      const supabase = createClient();
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `documents/${Date.now()}-${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (signal.aborted) return;
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      const fileUrl = publicUrlData.publicUrl;

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size, fileUrl }),
      });

      if (signal.aborted) return;

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register document');

      const uploadedDoc = data.document;
      setUploading(false);
      setProcessing(true);
      setProgressStatus('Extracting pages & generating embeddings...');

      const processRes = await fetch(`/api/documents/${uploadedDoc.id}/process`, {
        method: 'POST',
        signal,
      });

      if (signal.aborted) return;

      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error || 'Document processing failed');

      onSuccess(processData.document || uploadedDoc);
      onClose();
    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) return;
      setErrorMessage(err.message || 'An unexpected error occurred during upload.');
    } finally {
      if (!signal.aborted) {
        setUploading(false);
        setProcessing(false);
        setProgressStatus('');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-[#13151c] border border-white/[0.1] rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col shadow-2xl relative my-auto overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Upload className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm sm:text-base text-slate-100">Upload PDF</h3>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title={isActive ? 'Cancel upload' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !isActive && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all ${
              isActive
                ? 'border-white/[0.06] bg-white/[0.01] cursor-not-allowed opacity-50'
                : dragActive
                ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10 cursor-pointer'
                : 'border-white/[0.1] hover:border-indigo-500/40 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={isActive}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  validateAndSetFile(e.target.files[0]);
                }
              }}
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {selectedFile ? selectedFile.name : 'Drop your PDF here, or browse'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedFile
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to ingest`
                    : 'PDF documents up to 20MB supported'}
                </p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isActive && (
            <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span className="flex-1">{progressStatus}</span>
              </div>
              <div className="w-full bg-white/[0.06] rounded-full h-1 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full w-full animate-pulse" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-full text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isActive && <StopCircle className="w-3.5 h-3.5 text-red-400" />}
              {isActive ? 'Stop & Close' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || isActive}
              className="px-5 py-2 rounded-full text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{processing ? 'Processing...' : uploading ? 'Uploading...' : 'Ingest Document'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
