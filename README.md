# 🎨 Raphael AI — Document Intelligence & Research Platform

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%2B_pgvector-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

> A production-grade multi-tenant AI document research platform powered by **Hybrid Retrieval-Augmented Generation (pgvector cosine similarity + PostgreSQL full-text search)** with **Reciprocal Rank Fusion (RRF)**, exact page-level source citations, grounded anti-hallucination guards, multi-LLM cascading fallback, and an automated evaluation test harness.

---

## 📑 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Clone & Install](#2-clone--install)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Setup Supabase Database](#4-setup-supabase-database)
  - [5. Run Development Server](#5-run-development-server)
- [API Reference](#-api-reference)
- [Automated Evaluation Suite](#-automated-evaluation-suite)
- [Deployment Guide](#-deployment-guide)
- [License](#-license)

---

## 🏛 Architecture Overview

```
                                 USER (Next.js Frontend)
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
            Document Management                                Chat & Q&A
       (Upload PDF, Status, Delete)                   (Ask Questions, Multi-turn)
                     │                                             │
                     ▼                                             ▼
      /api/documents/upload & /process                    /api/chat (SSE Stream)
                     │                                             │
      ┌──────────────┴──────────────┐               ┌──────────────┴──────────────┐
      ▼                             ▼               ▼                             ▼
Supabase Storage               pdf-parse      Query Rewriter                Hybrid Search
(PDF file archive)         (extract & chunk) (follow-up context)        (pgvector + ts_rank)
                                    │                                             │
                                    ▼                                             ▼
                          Gemini Embedding (768-d)                      RRF Fusion (Top 5-8)
                                    │                                             │
                                    ▼                                             ▼
                          PostgreSQL / Supabase                         Confidence Gate
                      (document_chunks + pgvector)                    (Grounded Refusal)
                                                                                  │
                                                                                  ▼
                                                                     Multi-LLM Cascading Stream
                                                                    (Groq ➔ Gemini ➔ OpenRouter)
                                                                                  │
                                                                                  ▼
                                                                        Streamed Answer with
                                                                       Page-Level Source Tags
```

---

## ✨ Key Features

- **🔍 Hybrid Retrieval (Dense Vector + Sparse Keyword)**:
  - **Dense Semantic Search**: `pgvector` HNSW cosine distance (`<=>` operator) capturing semantic nuances and paraphrased questions.
  - **Sparse Keyword Search**: PostgreSQL full-text search (`tsvector` + `ts_rank` with `websearch_to_tsquery`) capturing exact terminology, dates, names, and codes.
  - **Reciprocal Rank Fusion (RRF)**: Normalizes and blends vector and lexical ranks via $RRF(d) = \sum \frac{1}{60 + \text{rank}}$ to return the top 5–8 most authoritative chunks.

- **🛡️ Strict Grounding & Anti-Hallucination Guard**:
  - Automatically assesses retrieval confidence. If context is missing, the model returns a grounded refusal (*"I could not find sufficient information..."*) rather than fabricating facts.

- **📑 Exact Page-Level Source Citations**:
  - Every answer chunk is pinned to exact page boundaries (`[Page 42]`). Interactive citation chips provide full transparency into similarity scores and text snippets.

- **⚡ Multi-LLM Cascading Fallback**:
  - Dynamically routes requests through your configured engine priority (`groq`, `gemini`, or `openrouter`). If a provider encounters rate limits or errors, Raphael automatically fails over to secondary models with zero downtime.

- **🔄 Follow-Up Query Rewriting**:
  - In multi-turn dialogues, ambiguous pronouns and references (*"What did they decide then?"*) are re-written into standalone search queries before retrieval.

- **🩺 Live System Health & Diagnostics**:
  - Real-time diagnostic panel verifying database health, `pgvector` extension status, Supabase Storage buckets, and LLM provider latency.

- **📊 Built-in Evaluation Harness**:
  - Measure performance with an automated benchmark runner scoring **Retrieval Hit @ K**, **Citation Accuracy**, **Grounded Refusal Rate**, and **End-to-End Latency**.

- **⏱️ Keep-Alive Daemon**:
  - Includes a scheduled `/api/keep-alive` endpoint to prevent free-tier Supabase projects from pausing due to inactivity.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) | Server Components, SSE streaming routes, API endpoints |
| **Frontend UI** | [React 19](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/) | Modern responsive interface, dark theme, interactive citation badges |
| **Database & Search** | [Supabase](https://supabase.com/) PostgreSQL + `pgvector` | Unified relational storage, vector indexing (HNSW), and full-text search |
| **File Storage** | Supabase Storage (`documents` bucket) | Secure PDF document archive |
| **Embeddings** | Google Gemini `gemini-embedding-001` (768 dims) | Dense semantic vector representation |
| **Inference Engines** | [Groq](https://groq.com/), [Gemini](https://ai.google.dev/), [OpenRouter](https://openrouter.ai/) | Cascading high-throughput generation with streaming responses |
| **PDF Extraction** | `pdf-parse` | Node.js page-by-page text extraction and metadata parsing |

---

## 📁 Project Structure

```bash
raphael-ai/
├── app/
│   ├── api/
│   │   ├── chat/              # SSE streaming Q&A route
│   │   ├── conversations/     # Chat sessions & history API
│   │   ├── documents/         # Document upload, processing & deletion
│   │   ├── evaluate/          # Benchmark runner endpoint
│   │   ├── health/            # Diagnostic healthcheck endpoint
│   │   └── keep-alive/        # Database ping endpoint
│   ├── layout.tsx             # Root layout & theme configuration
│   └── page.tsx               # Main research dashboard view
├── components/
│   ├── chat-view.tsx          # Interactive Q&A chat interface
│   ├── citation-badge.tsx     # Page-level source citation chip
│   ├── document-list.tsx      # Uploaded documents manager
│   ├── evaluation-modal.tsx   # Benchmark test runner UI
│   ├── markdown-renderer.tsx  # Rich formatted Markdown & citations
│   ├── navbar.tsx             # Top navigation bar & action triggers
│   ├── system-status-modal.tsx# Live system diagnostic panel
│   └── upload-modal.tsx       # PDF drag-and-drop upload modal
├── lib/
│   ├── auth/context.ts        # Multi-tenant workspace resolution
│   ├── rag/
│   │   ├── chunker.ts         # Sliding-window document chunking
│   │   ├── embeddings.ts      # Gemini 768-dim embedding generator
│   │   ├── hybrid-search.ts   # Vector + Full-text search with RRF
│   │   ├── llm-stream.ts      # Multi-provider streaming cascade
│   │   ├── pdf-parser.ts      # PDF text & page extraction
│   │   └── query-rewriter.ts  # Contextual query reformulation
│   └── supabase/              # Supabase admin, client, and SSR instances
├── scripts/
│   ├── evaluate.ts            # CLI automated benchmark harness
│   └── sample-questions.json  # Benchmark test cases
├── supabase/
│   └── schema.sql             # Complete PostgreSQL schema, tables, RPCs & RLS
└── .env.example               # Environment variables template
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `v20.x` or higher
- **npm**, **pnpm**, or **yarn**
- A free [Supabase](https://supabase.com/) account
- An API key for **Google Gemini** (required for 768-d embeddings), and optionally **Groq** or **OpenRouter**

### 2. Clone & Install

```bash
git clone https://github.com/Tarunmeharwal/raphael-ai.git
cd raphael-ai
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file from the provided template:

```bash
cp .env.example .env.local
```

Fill in your API keys in `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Embeddings & Primary LLM (Required for 768-dim embeddings)
GEMINI_API_KEY=your-gemini-api-key

# Optional Fast Inference Providers
GROQ_API_KEY=your-groq-api-key
OPENROUTER_API_KEY=your-openrouter-api-key

# Priority Provider: 'groq' | 'gemini' | 'openrouter' (default: groq)
LLM_PROVIDER=groq
```

### 4. Setup Supabase Database

1. Open your project on [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to the **SQL Editor**.
3. Copy and paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.

This migration automatically sets up:
- `vector` and `uuid-ossp` extensions
- Tables: `organizations`, `documents`, `document_chunks`, `conversations`, `messages`, `message_sources`
- HNSW Cosine vector indexes and GIN Full-Text Search indexes
- Stored Procedures: `match_chunks_vector` and `match_chunks_keyword`
- Storage bucket `documents` with public read/write access policies

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/documents/upload` | Uploads PDF (< 20MB) to Supabase Storage & registers record |
| `POST` | `/api/documents/:id/process` | Extracts pages, chunks (~500 tokens), embeds, and indexes in PostgreSQL |
| `GET` | `/api/documents` | Retrieves all registered documents for current workspace |
| `DELETE` | `/api/documents/:id` | Deletes document record, associated chunks, and storage file |
| `POST` | `/api/chat` | Server-Sent Events (SSE) streaming Q&A with hybrid search & citations |
| `GET` | `/api/conversations` | Lists past conversation sessions with associated document references |
| `GET` | `/api/conversations/:id` | Fetches historical messages and source citations for a session |
| `DELETE` | `/api/conversations/:id` | Deletes a conversation session |
| `GET` | `/api/health` | Comprehensive diagnostics for DB, `pgvector`, Storage, and LLM APIs |
| `POST` | `/api/evaluate` | Runs the automated RAG benchmark evaluation suite |
| `GET` | `/api/keep-alive` | Simple DB ping to prevent Supabase 7-day inactivity pause |

---

## 🧪 Automated Evaluation Suite

Raphael includes an automated benchmark harness to evaluate RAG retrieval and answer fidelity.

### Run via Command Line

```bash
npx tsx scripts/evaluate.ts
```

### Run via Web Interface

Click on the **Evaluation Suite** button in the navigation bar to run benchmarks directly in the browser and view:
- **Retrieval Accuracy (Hit @ 6)**: Measures whether relevant chunks were retrieved.
- **Citation Precision**: Verifies exact page citations match the golden dataset.
- **Grounded Refusal Rate**: Validates that out-of-scope questions are safely rejected.
- **End-to-End Latency**: Benchmarks overall response latency.

---

## 🌐 Deployment Guide

### Deploying to Vercel

1. Push your repository to GitHub.
2. Import the repository into [Vercel](https://vercel.com).
3. Under **Project Settings > Environment Variables**, add the variables defined in your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY` (if using Groq)
   - `OPENROUTER_API_KEY` (if using OpenRouter)
   - `LLM_PROVIDER`
4. Deploy! Next.js App Router and Edge/Node streaming routes will work out of the box.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
