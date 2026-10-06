/**
 * Signed, expiring login token — the website's one credential ([08-APIAUTH], F-039).
 *
 * BEFORE THIS FILE the login cookie was the fixed word "authenticated" and middleware checked only
 * that a cookie by that name EXISTED. Anyone who knew the cookie name could write it into their own
 * browser and walk past the login without the password. A credential that can be written down from
 * memory is not a credential.
 *
 * Token = `<expiry-unix-seconds>.<hex HMAC-SHA256(secret, expiry)>`. Verifying needs the secret, so
 * only the server can mint one; the expiry is inside the signed material, so it cannot be extended
 * by editing the cookie. Web Crypto only — this runs in the Edge runtime (middleware) as well as in
 * Node (the login server action), and `crypto` from Node is not available in the former.
 *
 * The key is `AUTH_SECRET` if set, else derived from `DASHBOARD_PASSWORD` (always set, since the
 * login itself needs it). The fallback exists so layer 1 deploys with no new Vercel variable; a
 * dedicated AUTH_SECRET is still the better practice because rotating the password then does not
 * log everyone out, and vice versa.
 */

export const AUTH_COOKIE = 'skypilot-auth-token';
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 1 week, as before

function keyMaterial(): string | null {
  const explicit = process.env.AUTH_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const pw = process.env.DASHBOARD_PASSWORD;
  if (pw) return `skypilot-auth:${pw}`;
  return null;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare: a signature check must not leak where it diverged. */
function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a token valid for `ttlSeconds` from `now` (ms epoch). Throws if no key is configured. */
export async function signToken(now: number = Date.now(),
                                ttlSeconds: number = TOKEN_TTL_SECONDS,
                                secret: string | null = keyMaterial()): Promise<string> {
  if (!secret) throw new Error('AUTH_SECRET / DASHBOARD_PASSWORD not configured');
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

/**
 * True only for a token this server minted that has not expired. Every other shape — the legacy
 * "authenticated" cookie, a tampered expiry, a wrong key, garbage — is false. Never throws: an
 * unverifiable token is simply "not logged in".
 */
export async function verifyToken(token: string | undefined | null,
                                  now: number = Date.now(),
                                  secret: string | null = keyMaterial()): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{1,12}$/.test(expStr) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(expStr) <= Math.floor(now / 1000)) return false;
  try {
    return equalConstantTime(sig, await hmacHex(secret, expStr));
  } catch {
    return false;
  }
}
