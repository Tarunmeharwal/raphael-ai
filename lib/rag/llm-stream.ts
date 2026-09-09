import { RetrievedChunk } from './hybrid-search';
import { ChatMessageTurn } from './query-rewriter';

export interface SourceCitation {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  snippet: string;
  similarity?: number;
  fusedScore?: number;
}

export interface StreamGenerateOptions {
  question: string;
  contextChunks: RetrievedChunk[];
  history?: ChatMessageTurn[];
  documentName?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the strict grounded system instruction and contextual prompt
 */
function buildPrompt(options: StreamGenerateOptions): string {
  const { question, contextChunks, history = [], documentName } = options;

  const formattedContext = contextChunks
    .map(
      (chunk) =>
        `[Document: ${chunk.documentName || documentName || 'Document'} | Page ${chunk.pageNumber} | Chunk ${chunk.chunkIndex}]\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  let historySection = '';
  if (history.length > 0) {
    historySection =
      'CONVERSATION HISTORY:\n' +
      history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n') +
      '\n\n';
  }

  return `You are Raphael, an expert document research intelligence assistant. Answer the user's question using ONLY the retrieved document context provided below.

STRICT GROUNDING RULES:
1. Base your answer solely on the facts directly mentioned in the CONTEXT.
2. If the user asks for a summary, overview, key findings, or complete summary, synthesize and summarize all the information available in the provided CONTEXT into a structured, comprehensive overview. Do NOT refuse simply because the context is a subset of the document.
3. If the question asks about a topic completely unmentioned or absent in the context, state: "I could not find sufficient information in the uploaded document to answer this question." Do NOT hallucinate, extrapolate, or use outside knowledge.
4. Cite source pages using [Page X] naturally and concisely. Do NOT repeat the same [Page X] tag across consecutive sentences from the same page—cite once at the end of the thought or paragraph. Only add a new [Page X] tag when switching to a different page number.
5. Format your output with rich, beautiful Markdown structure:
   - Use ### Headings for distinct sections, categories, or concepts.
   - For bullet lists, ALWAYS place each bullet point on its own new line prefixed with "* " (never combine multiple bullets onto a single line).
   - Use **bold** for key concepts and terms.
   - Use inline code backticks (\`code\`) for technical terms, function names, components, and code keywords (e.g. \`useState\`, \`useEffect\`, \`props\`).
   - Separate paragraphs and sections with clean line breaks so it is engaging and easy to read.

CONTEXT:
${formattedContext}

${historySection}USER QUESTION:
${question}

ANSWER (with page citations):`;
}

/**
 * Stream answer from Gemini 2.5 Flash with exponential backoff and OpenRouter fallback.
 */
async function* tryStreamGroq(fullPrompt: string, apiKey?: string) {
  if (!apiKey) return;
  const groqModels = [
    process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    'qwen/qwen3.8-27b',
    'groq/compound-mini',
  ];

  for (const model of groqModels) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are Raphael, an expert document research intelligence assistant. Answer strictly from the provided context using [Page X] citations and rich Markdown formatting.',
            },
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.2,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        console.warn(`[Groq Stream] Model ${model} failed [${res.status}]. Trying next...`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                received++;
                yield delta;
              }
            } catch {}
          }
        }
      }

      if (received > 0) return;
    } catch (err: any) {
      console.warn(`[Groq Stream] Error with ${model}:`, err.message);
    }
  }
}

async function* tryStreamGemini(fullPrompt: string, apiKey?: string) {
  if (!apiKey) return;
  const candidateModels = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash',
  ];

  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!res.ok || !res.body) {
        console.warn(`[Gemini Stream] Model ${model} failed [${res.status}]. Trying next...`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textPart) {
                received++;
                yield textPart;
              }
            } catch {}
          }
        }
      }

      if (received > 0) return;
    } catch (err: any) {
      console.warn(`[Gemini Stream] Error with ${model}:`, err.message);
    }
  }
}

async function* tryStreamOpenRouter(fullPrompt: string, apiKey?: string) {
  if (!apiKey) return;
  const openRouterModels = [
    process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free',
    'thinkingmachines/inkling:free',
  ];

  for (const model of openRouterModels) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://raphael.local',
          'X-Title': 'Raphael',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are Raphael, an expert document research intelligence assistant. Answer strictly from the provided context using [Page X] citations and clean Markdown formatting.',
            },
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.2,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        console.warn(`[OpenRouter Stream] Model ${model} failed [${res.status}]. Trying next...`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                received++;
                yield delta;
              }
            } catch {}
          }
        }
      }

      if (received > 0) return;
    } catch (err: any) {
      console.warn(`[OpenRouter Stream] Error with ${model}:`, err.message);
    }
  }
}

/**
 * Stream answer dynamically supporting Groq, Gemini, and OpenRouter with automatic fallback
 */
export async function* streamGroundedAnswer(
  options: StreamGenerateOptions
): AsyncGenerator<{
  type: 'token' | 'sources' | 'error' | 'provider';
  content?: string;
  sources?: SourceCitation[];
}> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  const citations: SourceCitation[] = options.contextChunks.map((c) => ({
    chunkId: c.id,
    documentId: c.documentId,
    documentName: c.documentName || options.documentName || 'Document',
    pageNumber: c.pageNumber,
    chunkIndex: c.chunkIndex,
    snippet: c.content.slice(0, 240) + (c.content.length > 240 ? '...' : ''),
    similarity: c.vectorSimilarity,
    fusedScore: c.fusedScore,
  }));

  const fullPrompt = buildPrompt(options);
  const preferred = (process.env.LLM_PROVIDER || 'groq').toLowerCase();

  // Cascades configured dynamically based on LLM_PROVIDER
  const providers =
    preferred === 'gemini'
      ? [
          { name: 'Gemini (Flash)', run: () => tryStreamGemini(fullPrompt, geminiApiKey) },
          { name: 'Groq (120B)', run: () => tryStreamGroq(fullPrompt, groqApiKey) },
          { name: 'OpenRouter', run: () => tryStreamOpenRouter(fullPrompt, openRouterApiKey) },
        ]
      : preferred === 'openrouter'
      ? [
          { name: 'OpenRouter', run: () => tryStreamOpenRouter(fullPrompt, openRouterApiKey) },
          { name: 'Groq (120B)', run: () => tryStreamGroq(fullPrompt, groqApiKey) },
          { name: 'Gemini (Flash)', run: () => tryStreamGemini(fullPrompt, geminiApiKey) },
        ]
      : [
          { name: 'Groq (120B)', run: () => tryStreamGroq(fullPrompt, groqApiKey) },
          { name: 'Gemini (Flash)', run: () => tryStreamGemini(fullPrompt, geminiApiKey) },
          { name: 'OpenRouter', run: () => tryStreamOpenRouter(fullPrompt, openRouterApiKey) },
        ];

  let success = false;

  for (const provider of providers) {
    if (success) break;
    let tokens = 0;
    for await (const token of provider.run()) {
      if (tokens === 0) {
        yield { type: 'provider', content: provider.name };
      }
      tokens++;
      success = true;
      yield { type: 'token', content: token };
    }
  }

  if (!success) {
    yield {
      type: 'error',
      content:
        'Unable to complete AI response due to provider rate limits or missing keys. Please verify your keys.',
    };
    return;
  }

  // Finally yield citations
  yield {
    type: 'sources',
    sources: citations,
  };
}
