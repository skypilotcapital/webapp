'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AUTH_COOKIE, TOKEN_TTL_SECONDS, signToken } from '@/lib/authToken';

export async function loginAction(prevState: any, formData: FormData) {
  const password = formData.get('password');
  const correctPassword = process.env.DASHBOARD_PASSWORD;

  if (!correctPassword) {
    console.error('DASHBOARD_PASSWORD environment variable is not set');
    return { error: 'Server configuration error. Contact administrator.' };
  }

  if (password === correctPassword) {
    // A SIGNED, EXPIRING token — not a fixed word. The middleware verifies the signature on every
    // request, so a cookie typed in by hand is not a login ([08-APIAUTH], F-039).
    const token = await signToken();
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_TTL_SECONDS,
    });

    // Redirect on success
    redirect('/');
  }

  return { error: 'Incorrect password' };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  redirect('/login');
}
