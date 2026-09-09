import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Newsreader } from 'next/font/google';
import './globals.css';

const sansFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const serifFont = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Raphael — Document Intelligence & Research',
  description:
    'A calm, human-designed document research and intelligence workspace powered by Gemini with verified page citations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark h-full ${sansFont.variable} ${serifFont.variable}`}
    >
      <body className="h-full bg-[#0b0c10] text-[#e3e5e8] font-sans antialiased overflow-hidden selection:bg-indigo-500/20 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
