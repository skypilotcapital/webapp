'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 px-6">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border-b border-black pb-8 mb-8 text-center sm:text-left">
          <h2 className="text-3xl font-bold tracking-tight text-black uppercase">
            SkyPilot Capital
          </h2>
          <p className="mt-3 text-sm text-slate-500 uppercase tracking-widest font-medium">
            Internal Dashboard Access
          </p>
        </div>

        <div className="bg-white border border-slate-300 p-8">
          <form className="space-y-6" action={formAction}>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-bold text-black uppercase tracking-wide mb-2"
              >
                Password
              </label>
              <div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none block w-full px-4 py-3 border border-slate-300 bg-slate-50 rounded-none placeholder-slate-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black sm:text-sm transition-colors"
                />
              </div>
            </div>

            {state?.error && (
              <div className="text-red-600 text-sm font-bold tracking-wide uppercase border-l-4 border-red-600 pl-3">
                {state.error}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-4 px-4 border border-black rounded-none shadow-none text-sm font-bold uppercase tracking-wider text-white bg-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50"
              >
                {isPending ? 'Authenticating...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
