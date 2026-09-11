// Polyfill standard DOM globals expected by pdfjs-dist in serverless / Node.js runtimes
// This avoids needing native canvas / C++ bindings on Linux / Vercel Lambda
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;
    constructor(init?: any) {
      if (Array.isArray(init)) {
        this.a = init[0] ?? 1; this.b = init[1] ?? 0;
        this.c = init[2] ?? 0; this.d = init[3] ?? 1;
        this.e = init[4] ?? 0; this.f = init[5] ?? 0;
      }
    }
    inverse() { return this; }
    invertSelf() { return this; }
    multiply() { return this; }
    multiplySelf() { return this; }
    preMultiplySelf() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    transformPoint(point: any) { return point; }
    toFloat32Array() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
    toFloat64Array() { return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  };
}

if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  };
}

if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

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
  // Pre-load the worker into memory so pdfjs uses in-memory WorkerMessageHandler
  // without attempting to dynamically resolve external filesystem paths on Vercel Lambda
  if (!(globalThis as any).pdfjsWorker) {
    // @ts-ignore
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as any).pdfjsWorker = worker;
  }

  // Dynamically load the legacy build of pdfjs-dist designed for Node.js / serverless
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
