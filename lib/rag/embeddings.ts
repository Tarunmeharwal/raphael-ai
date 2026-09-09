const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const TARGET_DIMENSION = 768;

/**
 * Utility for exponential backoff sleep
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate embedding for a single text string using Gemini.
 */
export async function embedText(text: string, retries = 3): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: text.slice(0, 8000) }] },
          outputDimensionality: TARGET_DIMENSION,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 429 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          console.warn(`[Gemini Embed] Rate limit 429 hit. Retrying in ${Math.round(delay)}ms...`);
          await sleep(delay);
          attempt++;
          continue;
        }
        throw new Error(`Gemini embedContent failed [${res.status}]: ${errorText}`);
      }

      const data = await res.json();
      if (!data.embedding?.values) {
        throw new Error('No embedding returned in Gemini response');
      }

      return data.embedding.values;
    } catch (err: any) {
      if (attempt < retries && (err.message.includes('429') || err.message.includes('fetch failed'))) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await sleep(delay);
        attempt++;
      } else {
        throw err;
      }
    }
  }

  throw new Error('Exceeded max retries for Gemini embedding');
}

/**
 * Generate embeddings for multiple text chunks in batches of size `batchSize`.
 */
export async function embedBatch(
  texts: string[],
  batchSize = 10,
  onProgress?: (processed: number, total: number) => void
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunkBatch = texts.slice(i, i + batchSize);

    const requests = chunkBatch.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: TARGET_DIMENSION,
    }));

    let attempt = 0;
    const maxRetries = 3;
    let batchSuccess = false;

    while (attempt <= maxRetries && !batchSuccess) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 429 && attempt < maxRetries) {
            const backoff = Math.pow(2, attempt) * 1500 + Math.random() * 500;
            console.warn(`[Gemini Batch Embed] 429 Rate limited. Waiting ${Math.round(backoff)}ms...`);
            await sleep(backoff);
            attempt++;
            continue;
          }
          throw new Error(`batchEmbedContents error [${res.status}]: ${errText}`);
        }

        const data = await res.json();
        if (!data.embeddings || data.embeddings.length !== chunkBatch.length) {
          throw new Error('Unexpected batch embeddings output count');
        }

        for (const emb of data.embeddings) {
          allEmbeddings.push(emb.values);
        }
        batchSuccess = true;
      } catch (err: any) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1500 + Math.random() * 500;
          await sleep(backoff);
          attempt++;
        } else {
          // Fallback: process this batch one-by-one
          console.warn('[Gemini Embed] Batch failed, falling back to sequential calls for batch');
          for (const item of chunkBatch) {
            const single = await embedText(item);
            allEmbeddings.push(single);
          }
          batchSuccess = true;
        }
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }

    // Gentle 300ms pause between batches to stay comfortably within the 10 RPM rate limit
    if (i + batchSize < texts.length) {
      await sleep(350);
    }
  }

  return allEmbeddings;
}
