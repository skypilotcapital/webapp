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
      <body className="min-h-full text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 relative" style={{ backgroundColor: '#FDFCFB' }}>
        {/* Vibrant Natural Atmosphere */}
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <div className="absolute top-[-15%] left-[-15%] w-[70%] h-[70%] bg-indigo-500/15 blur-[140px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-15%] w-[60%] h-[60%] bg-sky-400/15 blur-[140px] rounded-full"></div>
          <div className="absolute top-[25%] left-[35%] w-[45%] h-[45%] bg-rose-400/5 blur-[120px] rounded-full"></div>
        </div>

        <header className="bg-white/60 backdrop-blur-2xl border-b border-black/5 sticky top-0 z-50">
          <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#4F46E5]/40 to-transparent"></div>
          <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-5 group">
              <div className="w-11 h-11 bg-[#4F46E5] text-white flex items-center justify-center font-black rounded-2xl group-hover:bg-white group-hover:text-[#4F46E5] group-hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] border border-transparent group-hover:border-[#4F46E5]/20 transition-all duration-500">S</div>
              <span className="text-xl font-bold tracking-tight text-[#0F172A] group-hover:text-[#4F46E5] transition-colors">
                SkyPilot Capital
              </span>
            </Link>
            <nav className="flex items-center gap-14 text-sm font-semibold tracking-tight">
              <Link href="/monitor" className="text-slate-500 hover:text-[#4F46E5] transition-all relative group/link">
                Data Monitor
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#4F46E5] transition-all group-hover/link:w-full"></span>
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

        <main className="max-w-7xl mx-auto px-8 py-16" style={{ backgroundColor: '#FDFCFB' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
