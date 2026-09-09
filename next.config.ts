import type { NextConfig } from "next";

// Suppress Supabase Node 20 deprecation warning in console
const originalWarn = console.warn;
console.warn = function (...args: any[]) {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Node.js 20 and below are deprecated')
  ) {
    return;
  }
  originalWarn.apply(console, args);
};

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
