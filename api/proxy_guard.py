"""The API's one door: a shared secret proving the request came through the logged-in website.

[08-APIAUTH] / F-039. The website's login protected pages and nothing else: every page fetched
through a `/api-proxy` rewrite the login check excluded, and uvicorn also listened on the public
port with the firewall off. The API had no authentication of its own, and the code's comments
assumed website auth was trading auth. It was not.

The website's middleware now verifies a signed login token and, for requests it forwards to this
API, SETS the header `X-Skypilot-Proxy` to a secret only Vercel and this server know. This guard
requires that header on every request. A request straight at the port does not have it, and a
browser that never passed the login does not have it either, so one check closes both doors.

⚠️ FAIL CLOSED. If `PROXY_SECRET` is empty, every request except `/health` is refused with 503 and
a message saying why. The alternative — serve everything when the variable is missing — is how an
unauthenticated API ships "by accident" the second time. `/health` stays open and REPORTS the guard
state, so a mis-deployment is visible from outside, not just from the logs.

⚠️ THIS IS PAPER-GRADE. One shared secret says "the website sent this", not WHO clicked. Per-user
auth (Q1) and live access control (Q3) remain pre-live requirements; `approve`/`execute` still
record the operator name as claimed, not authenticated.

Not a FastAPI dependency on each router: a dependency has to be remembered on every new router and
the ninth one would be the one that forgot. Pure ASGI middleware, so it is in front of everything
that exists and everything that will.
"""
from __future__ import annotations

import hmac
import json

from starlette.types import ASGIApp, Receive, Scope, Send

HEADER = b"x-skypilot-proxy"
OPEN_PATHS = frozenset({"/health"})


def guard_state(secret: str) -> str:
    return "configured" if secret else "UNCONFIGURED — refusing all requests except /health"


class ProxySecretGuard:
    def __init__(self, app: ASGIApp, secret: str):
        self.app = app
        self.secret = secret or ""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        # CORS preflight carries no custom headers by definition; refusing it would only break the
        # browser's ability to learn that the real request will be refused.
        if path in OPEN_PATHS or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        if not self.secret:
            await _reject(send, 503, "API proxy secret not configured on this deployment — set "
                                     "PROXY_SECRET in api/.env (see .env.example) and restart; "
                                     "refusing every request except /health until then")
            return
        supplied = next((v for k, v in scope.get("headers", []) if k == HEADER), b"")
        if not hmac.compare_digest(supplied, self.secret.encode()):
            await _reject(send, 401, "not via the website proxy")
            return
        await self.app(scope, receive, send)


async def _reject(send: Send, status: int, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})
