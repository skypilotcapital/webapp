import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SkyPilot Capital — Internal Dashboard',
  description: 'Internal dashboard for the SkyPilot Capital team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-black selection:bg-slate-200">
        {/* Header */}
        <header className="bg-white border-b border-slate-300 sticky top-0 z-10 transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <Link href="/" className="text-base font-bold text-black uppercase tracking-tight hover:opacity-70 transition-opacity">
              SkyPilot Capital
            </Link>
            <nav className="flex items-center gap-8 text-sm font-medium">
              <Link href="/monitor" className="text-slate-600 hover:text-black transition-colors">
                Data Monitor
              </Link>
              <span className="text-slate-300 cursor-not-allowed" title="Coming soon">
                Model Research
              </span>
              <span className="text-slate-300 cursor-not-allowed" title="Coming soon">
                Portfolio
              </span>
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-6 py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
