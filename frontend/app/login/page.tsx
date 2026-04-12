'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen bg-brand-navy flex flex-col justify-center py-12 px-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-brand-glow/30 blur-[150px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-brand-teal/10 blur-[150px] rounded-full"></div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="border-b border-white/10 pb-10 mb-12 text-center sm:text-left relative">
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase italic">
            SkyPilot
          </h2>
          <p className="mt-4 text-[10px] text-brand-teal font-black uppercase tracking-[0.5em] opacity-80">
            Secure Terminal Access
          </p>
        </div>

        <div className="bg-white/[0.04] backdrop-blur-3xl border border-white/10 p-12 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]">
          <form className="space-y-8" action={formAction}>
            <div>
              <label
                htmlFor="password"
                className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3"
              >
                Passcode
              </label>
              <div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none block w-full px-6 py-4 border border-white/10 bg-white/5 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal sm:text-sm transition-all shadow-sm"
                />
              </div>
            </div>

            {state?.error && (
              <div className="text-rose-500 text-[10px] font-black uppercase tracking-widest border-l-2 border-rose-500 pl-3">
                {state.error}
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-5 px-6 border border-transparent rounded-2xl shadow-xl text-xs font-black uppercase tracking-[0.2em] text-white bg-slate-100 hover:bg-brand-teal hover:text-white transition-all focus:outline-none disabled:opacity-50 text-[#08101C]"
              >
                {isPending ? 'Validating...' : 'Entry'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
