const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-flash-lite-latest';

export interface ChatMessageTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Rewrites a follow-up question using recent conversation turns into a standalone query.
 * Example: "Who won?" with previous turn "When was the Battle of Plassey?" -> "Who won the Battle of Plassey?"
 */
export async function rewriteQueryIfFollowUp(
  currentQuestion: string,
  history: ChatMessageTurn[]
): Promise<string> {
  // If no history, or question is already very long and specific, return directly
  if (!history || history.length === 0) {
    return currentQuestion;
  }

  const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  if (!apiKey) {
    return currentQuestion;
  }

  const recentHistory = history.slice(-3); // Last 2-3 turns
  const historyText = recentHistory
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join('\n');

  const prompt = `You are a search query rewriter for a document search engine.
Given the following conversation history and the user's latest follow-up question, rewrite the follow-up question into a single, complete, standalone search query.
Do NOT answer the question. Do NOT add extra conversational fluff.
If the question is already standalone, return it unchanged.

Conversation History:
${historyText}

Follow-up Question:
${currentQuestion}

Standalone Search Query:`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second cap

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100,
          },
        }),
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      return currentQuestion;
    }

    const data = await res.json();
    const rewritten = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (rewritten && rewritten.length > 2 && !rewritten.includes('\n')) {
      return rewritten.replace(/^["']|["']$/g, '');
    }
  } catch (err) {
    // Graceful fallback to original question
    console.warn('[Query Rewriter] Rewriter fallback to original question:', err);
  }

  return currentQuestion;
}
