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
        {/* Enhanced Natural Tints */}
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[0%] right-[-10%] w-[50%] h-[50%] bg-sky-400/10 blur-[130px] rounded-full"></div>
          <div className="absolute top-[20%] left-[30%] w-[40%] h-[40%] bg-amber-500/5 blur-[100px] rounded-full"></div>
        </div>

        <header className="bg-white/40 backdrop-blur-xl border-b border-black/5 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-gradient-to-br from-[#4F46E5] to-[#4338CA] text-white flex items-center justify-center font-black rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg shadow-indigo-500/20">S</div>
              <span className="text-xl font-bold tracking-tight text-[#0F172A] group-hover:text-[#4F46E5] transition-colors">
                SkyPilot Capital
              </span>
            </Link>
            <nav className="flex items-center gap-12 text-sm font-semibold tracking-wide">
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
