'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center py-12 px-6">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border-b border-zinc-800 pb-8 mb-10 text-center sm:text-left">
          <h2 className="text-3xl font-serif text-zinc-100 tracking-wide">
            SkyPilot Capital
          </h2>
          <p className="mt-3 text-sm text-amber-500/80 uppercase tracking-widest font-medium">
            Internal Dashboard Access
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-md shadow-2xl shadow-black/50">
          <form className="space-y-6" action={formAction}>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-serif text-zinc-300 tracking-wide mb-2"
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
                  className="appearance-none block w-full px-4 py-3 border border-zinc-700 bg-zinc-950 rounded-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 sm:text-sm transition-colors"
                />
              </div>
            </div>

            {state?.error && (
              <div className="text-red-400 text-sm font-bold tracking-wide uppercase border-l-2 border-red-400 pl-3">
                {state.error}
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-4 px-4 border border-zinc-700 rounded-sm shadow-none text-sm font-serif uppercase tracking-wider text-amber-500 bg-zinc-950 hover:bg-zinc-800 hover:text-amber-400 hover:border-amber-500/50 transition-all focus:outline-none disabled:opacity-50"
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
