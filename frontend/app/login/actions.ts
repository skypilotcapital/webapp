'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(prevState: any, formData: FormData) {
  const password = formData.get('password');
  const correctPassword = process.env.DASHBOARD_PASSWORD;

  if (!correctPassword) {
    console.error('DASHBOARD_PASSWORD environment variable is not set');
    return { error: 'Server configuration error. Contact administrator.' };
  }

  if (password === correctPassword) {
    const cookieStore = await cookies();
    cookieStore.set('skypilot-auth-token', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    // Redirect on success
    redirect('/');
  }

  return { error: 'Incorrect password' };
}
