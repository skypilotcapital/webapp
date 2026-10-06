// Signed login token tests ([08-APIAUTH]). Run from frontend/:  node scripts/test-authToken.mts
// Plain asserts; Node 22.6+ strips the types natively, no build step.
import { signToken, verifyToken } from '../lib/authToken.ts';
const S = 'unit-test-secret-at-least-16-chars';
const now = Date.UTC(2026, 9, 6, 12, 0, 0);
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('  ok ', m); };
const t = await signToken(now, 3600, S);
ok(/^\d+\.[0-9a-f]{64}$/.test(t), 'token shape exp.hexsig');
ok(await verifyToken(t, now, S), 'fresh token verifies');
ok(!(await verifyToken(t, now + 3601 * 1000, S)), 'expired token rejected');
ok(!(await verifyToken(t, now, 'other-secret-xxxxxxxxxxxxxxx')), 'wrong key rejected');
ok(!(await verifyToken('authenticated', now, S)), 'legacy fixed-word cookie rejected');
const [exp, sig] = t.split('.');
ok(!(await verifyToken(`${Number(exp) + 999999}.${sig}`, now, S)), 'edited expiry rejected');
ok(!(await verifyToken(`${exp}.${sig.slice(0, 63)}${sig.endsWith('0') ? '1' : '0'}`, now, S)), 'tampered signature rejected (last hex digit flipped)');
ok(!(await verifyToken(undefined, now, S)), 'missing token rejected');
ok(!(await verifyToken(t, now, null)), 'no key configured -> rejected, no throw');
console.log('all authToken tests passed');
