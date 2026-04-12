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
      <body className="min-h-full text-slate-900 selection:bg-sky-100 selection:text-sky-900 relative" style={{ backgroundColor: '#F8FAFC' }}>
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 bg-[#0F172A] text-white flex items-center justify-center font-bold rounded-md group-hover:bg-[#0284C7] transition-colors">S</div>
              <span className="text-xl font-bold tracking-tight text-[#0F172A]">
                SkyPilot Capital
              </span>
            </Link>
            <nav className="flex items-center gap-10 text-sm font-semibold tracking-wide">
              <Link href="/monitor" className="text-slate-500 hover:text-[#0F172A] transition-colors">
                Data Monitor
              </Link>
              <span className="text-slate-300 cursor-not-allowed">
                Research
              </span>
              <span className="text-slate-300 cursor-not-allowed">
                Portfolio
              </span>
            </nav>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-8 py-16" style={{ backgroundColor: '#F8FAFC' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
