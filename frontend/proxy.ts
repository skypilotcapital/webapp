import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { AUTH_COOKIE, verifyToken } from '@/lib/authToken';

/**
 * The website's single door ([08-APIAUTH], F-039). Next 16 calls this file `proxy.ts`; it is what
 * earlier versions called middleware, and the functionality is the same.
 *
 * THREE THINGS THIS USED TO GET WRONG, all fixed here:
 *
 *  1. The matcher excluded every path starting with `api` — written for Next route handlers that
 *     this app does not have (there is no `app/api/`), and it also excluded `/api-proxy/…`, the
 *     rewrite EVERY page fetches through. So the whole FastAPI was reachable with no cookie at all.
 *     The exclusion is gone; only genuinely static assets bypass the check.
 *  2. It checked that the cookie EXISTED, not what it said. The value was the fixed word
 *     "authenticated", so a cookie typed in by hand was a login. Now it is a signed, expiring
 *     token and the signature is verified on every request (lib/authToken.ts).
 *  3. Nothing told the API that a request had come through the logged-in website rather than
 *     straight at the droplet's port. Requests forwarded via `/api-proxy` now carry a shared secret
 *     header (`X-Skypilot-Proxy`, from `API_PROXY_SECRET`) that FastAPI requires; a request that
 *     did not pass this proxy does not have it. The header is SET here, never merged, so a
 *     client cannot supply its own.
 *
 * `/api-proxy/*` without a valid token answers 401 JSON rather than redirecting — the caller is a
 * `fetch`, and a redirect to an HTML login page would be parsed as a broken API response.
 */

// Not exported: Next.js permits only `proxy` and `config` as exports from this file.
const PROXY_HEADER = 'x-skypilot-proxy';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await verifyToken(request.cookies.get(AUTH_COOKIE)?.value);
  const isLoginPage = pathname === '/login';
  const isProxy = pathname === '/api-proxy' || pathname.startsWith('/api-proxy/');

  if (isProxy) {
    if (!authed) {
      return NextResponse.json({ detail: 'login required' }, { status: 401 });
    }
    const headers = new Headers(request.headers);
    headers.delete(PROXY_HEADER);                     // never trust a client-supplied copy
    const secret = process.env.API_PROXY_SECRET;
    if (secret) headers.set(PROXY_HEADER, secret);   // the rewrite forwards request headers
    return NextResponse.next({ request: { headers } });
  }

  // Redirect unauthenticated users to the login page
  if (!authed && !isLoginPage) {
    const res = NextResponse.redirect(new URL('/login', request.url));
    // A legacy or expired cookie is cleared so the browser stops presenting it.
    if (request.cookies.has(AUTH_COOKIE)) res.cookies.delete(AUTH_COOKIE);
    return res;
  }

  // Redirect authenticated users away from the login page
  if (authed && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. NOTE the deliberate absence of an `api` exclusion: this
     * app has no Next route handlers, and the old `(?!api|…)` is what left `/api-proxy` open.
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
