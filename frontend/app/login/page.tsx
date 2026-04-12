'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen bg-[#0B1527] flex flex-col justify-center py-12 px-6 relative">
      <div className="absolute inset-0 w-full h-full bg-cyan-900/20 blur-[150px] -z-10 pointer-events-none"></div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="border-b border-white/10 pb-8 mb-10 text-center sm:text-left">
          <h2 className="text-3xl font-bold text-white tracking-tight">
            SkyPilot Capital
          </h2>
          <p className="mt-3 text-sm text-cyan-400/80 uppercase tracking-widest font-medium">
            Internal Dashboard Access
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
          <form className="space-y-6" action={formAction}>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-200 mb-2"
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
                  className="appearance-none block w-full px-4 py-3 border border-white/10 bg-white/5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 sm:text-sm transition-all shadow-inner"
                />
              </div>
            </div>

            {state?.error && (
              <div className="text-rose-400 text-sm font-medium border-l-2 border-rose-400 pl-3">
                {state.error}
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-lg shadow-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-all focus:outline-none disabled:opacity-50"
              >
                {isPending ? 'Authenticating...' : 'Enter System'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
