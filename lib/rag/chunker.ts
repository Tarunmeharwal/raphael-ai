import { ExtractedPage } from './pdf-parser';

export interface Chunk {
  content: string;
  pageNumber: number;
  chunkIndex: number;
  tokenCount: number;
}

export interface ChunkingOptions {
  targetTokens?: number; // default ~500 tokens (~380 words)
  overlapTokens?: number; // default ~50 tokens (~38 words)
}

/**
 * Approximate token count (1 token ~= 0.75 words, or ~4 characters)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(wordCount * 1.3));
}

/**
 * Splits text into sentences cleanly without breaking abbreviations where possible.
 */
function splitIntoSentences(text: string): string[] {
  // Matches sentence terminators followed by whitespace
  const rawSentences = text.split(/(?<=[.?!])\s+/);
  return rawSentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Recursively splits pages into ~500 token chunks with 50-token overlap,
 * honoring paragraph and sentence boundaries.
 */
export function chunkDocumentPages(
  pages: ExtractedPage[],
  options: ChunkingOptions = {}
): Chunk[] {
  const targetTokens = options.targetTokens || 500;
  const overlapTokens = options.overlapTokens || 50;
  const chunks: Chunk[] = [];

  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageText = page.text.trim();
    if (!pageText) continue;

    // Split page into paragraphs
    const paragraphs = pageText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    let currentChunkSentences: string[] = [];
    let currentTokens = 0;

    const flushChunk = () => {
      if (currentChunkSentences.length === 0) return;

      const content = currentChunkSentences.join(' ').trim();
      const tokenCount = estimateTokens(content);

      if (content.length > 0) {
        chunks.push({
          content,
          pageNumber: page.pageNumber,
          chunkIndex: globalChunkIndex++,
          tokenCount,
        });
      }

      // Compute overlap: keep the trailing sentences that sum up to overlapTokens
      const overlapSentences: string[] = [];
      let overlapCount = 0;
      for (let i = currentChunkSentences.length - 1; i >= 0; i--) {
        const sentenceTokens = estimateTokens(currentChunkSentences[i]);
        if (overlapCount + sentenceTokens <= overlapTokens || overlapSentences.length === 0) {
          overlapSentences.unshift(currentChunkSentences[i]);
          overlapCount += sentenceTokens;
        } else {
          break;
        }
      }

      currentChunkSentences = overlapSentences;
      currentTokens = overlapCount;
    };

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);

      // If entire paragraph fits in current chunk
      if (currentTokens + paraTokens <= targetTokens) {
        currentChunkSentences.push(para);
        currentTokens += paraTokens;
      } else {
        // Break paragraph down into sentences
        const sentences = splitIntoSentences(para);

        for (const sentence of sentences) {
          const sentenceTokens = estimateTokens(sentence);

          // If a single sentence is larger than targetTokens, split by words
          if (sentenceTokens > targetTokens) {
            flushChunk();

            const words = sentence.split(/\s+/);
            let subWords: string[] = [];
            let subTokens = 0;

            for (const word of words) {
              const wordTokens = Math.max(1, Math.round(word.length / 4));
              if (subTokens + wordTokens > targetTokens) {
                chunks.push({
                  content: subWords.join(' '),
                  pageNumber: page.pageNumber,
                  chunkIndex: globalChunkIndex++,
                  tokenCount: subTokens,
                });
                // Overlap: keep last few words
                const overlapWordCount = Math.min(subWords.length, 30);
                subWords = subWords.slice(subWords.length - overlapWordCount);
                subTokens = estimateTokens(subWords.join(' '));
              }
              subWords.push(word);
              subTokens += wordTokens;
            }

            if (subWords.length > 0) {
              currentChunkSentences = [subWords.join(' ')];
              currentTokens = subTokens;
            }
          } else if (currentTokens + sentenceTokens > targetTokens) {
            flushChunk();
            currentChunkSentences.push(sentence);
            currentTokens += sentenceTokens;
          } else {
            currentChunkSentences.push(sentence);
            currentTokens += sentenceTokens;
          }
        }
      }
    }

    // Flush any remaining text on the page
    if (currentChunkSentences.length > 0) {
      const content = currentChunkSentences.join(' ').trim();
      if (content.length > 0) {
        chunks.push({
          content,
          pageNumber: page.pageNumber,
          chunkIndex: globalChunkIndex++,
          tokenCount: estimateTokens(content),
        });
      }
      currentChunkSentences = [];
      currentTokens = 0;
    }
  }

  return chunks;
}
