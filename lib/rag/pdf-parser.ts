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
 * Uses pdfjs-dist/legacy directly in pure JavaScript without native binary dependencies
 * or canvas, making it 100% reliable in serverless environments (like Vercel).
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<PDFExtractionResult> {
  // Dynamically load the legacy build of pdfjs-dist designed for Node.js / serverless
  // without DOM / DOMMatrix / Canvas browser requirements
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Line-aware text reconstruction based on vertical baseline positions
    let lastY: number | null = null;
    let pageStr = '';

    for (const item of content.items) {
      if ('str' in item) {
        // Detect vertical line jump
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageStr += '\n';
        } else if (pageStr.length > 0 && !pageStr.endsWith('\n') && !pageStr.endsWith(' ')) {
          pageStr += ' ';
        }
        pageStr += item.str;
        lastY = item.transform[5];
      }
    }

    const cleanText = pageStr
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();

    pages.push({
      pageNumber: i,
      text: cleanText,
    });

    page.cleanup();
  }

  const fullText = pages.map((p) => p.text).join('\n\n');

  return {
    totalPages,
    pages,
    fullText,
  };
}
