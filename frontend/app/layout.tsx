import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SkyPilot Capital — Internal Dashboard',
  description: 'Internal dashboard for the SkyPilot Capital team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-300 selection:bg-amber-900 selection:text-amber-100">
        <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10 transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <Link href="/" className="text-xl font-serif text-amber-500 hover:text-amber-400 transition-colors tracking-wide">
              SkyPilot Capital
            </Link>
            <nav className="flex items-center gap-8 text-sm font-medium tracking-wide">
              <Link href="/monitor" className="text-zinc-400 hover:text-amber-500 transition-colors">
                Data Monitor
              </Link>
              <span className="text-zinc-700 cursor-not-allowed" title="Coming soon">
                Model Research
              </span>
              <span className="text-zinc-700 cursor-not-allowed" title="Coming soon">
                Portfolio
              </span>
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
