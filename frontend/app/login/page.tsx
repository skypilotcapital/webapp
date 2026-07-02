'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-12 px-6 relative overflow-hidden"
      style={{
        background:
          'radial-gradient(1100px 600px at 80% -10%, rgba(14,124,111,0.08), transparent 60%),' +
          'radial-gradient(900px 520px at 4% 112%, rgba(180,83,9,0.05), transparent 55%), #f3eee4',
      }}
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div
            className="w-11 h-11 rounded-[12px] flex items-center justify-center font-black text-[22px]"
            style={{ background: 'linear-gradient(135deg,var(--teal),#0b6055)', color: '#fffdf9' }}
          >
            S
          </div>
          <div className="leading-tight">
            <div className="text-xl font-bold tracking-tight" style={{ color: 'var(--tx)' }}>SkyPilot Capital</div>
            <div className="text-[10px] font-bold tracking-[0.35em]" style={{ color: 'var(--teal)' }}>SECURE TERMINAL ACCESS</div>
          </div>
        </div>

        <div className="panel p-10">
          <form className="space-y-6" action={formAction}>
            <div>
              <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--tx-dim)' }}>
                Passcode
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="block w-full px-5 py-3.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)', color: 'var(--tx)' }}
              />
            </div>

            {state?.error && (
              <div className="text-[10px] font-bold uppercase tracking-widest pl-3" style={{ color: 'var(--neg)', borderLeft: '2px solid var(--neg)' }}>
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex justify-center py-4 px-6 rounded-xl text-xs font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50"
              style={{ background: 'var(--teal)', color: '#fffdf9' }}
            >
              {isPending ? 'Validating…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
