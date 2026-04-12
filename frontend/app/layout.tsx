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
      <body className="min-h-full bg-[#0B1527] text-slate-100 selection:bg-cyan-900 selection:text-cyan-100 relative">
        <div className="absolute top-0 w-full h-96 bg-cyan-900/20 blur-[120px] -z-10 pointer-events-none"></div>
        <header className="bg-[#0B1527]/80 backdrop-blur-lg border-b border-white/5 sticky top-0 z-10 transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <Link href="/" className="text-xl font-semibold text-white hover:text-cyan-400 transition-colors tracking-wide">
              SkyPilot Capital
            </Link>
            <nav className="flex items-center gap-8 text-sm font-medium tracking-wide">
              <Link href="/monitor" className="text-slate-300 hover:text-cyan-400 transition-colors">
                Data Monitor
              </Link>
              <span className="text-slate-600 cursor-not-allowed" title="Coming soon">
                Model Research
              </span>
              <span className="text-slate-600 cursor-not-allowed" title="Coming soon">
                Portfolio
              </span>
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-12 relative z-0">
          {children}
        </main>
      </body>
    </html>
  );
}
