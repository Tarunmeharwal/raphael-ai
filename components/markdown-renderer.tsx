'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Ensures bullet points and numbered lists always have proper newlines
 * even if the LLM generated them inline without linebreaks.
 */
function prepareMarkdown(text: string): string {
  if (!text) return '';
  // Convert [Page X] tags into `[Page X]` for dedicated citation badge styling
  let formatted = text.replace(/\[Page\s+(\d+)\]/gi, '`[Page $1]`');

  // Ensure bullets following punctuation, code, or tags are broken into newlines:
  formatted = formatted.replace(/([.\?!`\]\)])\s*[\*•]\s+/g, '$1\n\n* ');

  // Ensure numbered lists following punctuation are broken into newlines:
  formatted = formatted.replace(/([.\?!`\]\)])\s*(\d+)\.\s+/g, '$1\n\n$2. ');

  return formatted;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const preparedContent = prepareMarkdown(content);

  return (
    <div className={`prose-custom text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-slate-100 dark:text-white mt-4 mb-2 pb-1 border-b border-white/[0.08]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-slate-100 dark:text-white mt-3.5 mb-2 flex items-center gap-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-indigo-300 dark:text-indigo-400 mt-3 mb-1.5">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 text-slate-200 dark:text-slate-200 leading-relaxed">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 space-y-1.5 pl-5 list-disc list-outside text-slate-200 dark:text-slate-200 marker:text-indigo-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 space-y-1.5 pl-5 list-decimal list-outside text-slate-200 dark:text-slate-200 marker:text-indigo-400 font-normal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-100 dark:text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-300 dark:text-slate-300">
              {children}
            </em>
          ),
          code: ({ children, className }) => {
            const isInline = !className || !className.includes('language-');
            if (isInline) {
              const text = String(children);
              const isCitation = /^\[Page\s+\d+\]$/i.test(text.trim());
              if (isCitation) {
                return (
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 text-xs font-medium align-baseline shadow-xs select-none">
                    📄 {text.replace(/[\[\]]/g, '')}
                  </span>
                );
              }
              return (
                <code className="bg-white/[0.08] dark:bg-white/[0.08] text-indigo-300 dark:text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono border border-white/[0.06]">
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 p-3.5 rounded-xl bg-[#11131a] border border-white/[0.08] overflow-x-auto text-xs font-mono text-slate-200">
                <code>{children}</code>
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 pl-3.5 border-l-2 border-indigo-500/60 italic text-slate-300 bg-white/[0.02] py-1 rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors font-medium"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 border border-white/[0.08] rounded-lg">
              <table className="min-w-full divide-y divide-white/[0.08] text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/[0.04] text-slate-300 font-semibold">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-slate-200">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-300">{children}</td>
          ),
          hr: () => <hr className="my-3 border-white/[0.08]" />,
        }}
      >
        {preparedContent}
      </ReactMarkdown>
    </div>
  );
}
