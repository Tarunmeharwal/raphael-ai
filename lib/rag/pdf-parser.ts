// @ts-ignore
import { PDFParse } from 'pdf-parse';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface PDFExtractionResult {
  totalPages: number;
  pages: ExtractedPage[];
  fullText: string;
}

/**
 * Extracts text from a PDF Buffer, preserving individual page boundaries.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<PDFExtractionResult> {
  // Initialize PDFParse instance with the binary buffer
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();

  const totalPages = result.total || result.pages?.length || 1;
  const pages: ExtractedPage[] = [];

  if (result.pages && Array.isArray(result.pages)) {
    for (const p of result.pages) {
      const pageText = (p.text || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();

      pages.push({
        pageNumber: p.num || pages.length + 1,
        text: pageText,
      });
    }
  }

  // Fallback if pages array was empty
  if (pages.length === 0) {
    const rawText = (result.text || '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();

    pages.push({
      pageNumber: 1,
      text: rawText,
    });
  }

  return {
    totalPages,
    pages,
    fullText: result.text || pages.map((p) => p.text).join('\n\n'),
  };
}
