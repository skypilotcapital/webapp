"""The proxy-secret door ([08-APIAUTH]). Plain asserts; run from webapp/:  python -m api.tests.test_proxy_guard

Built on a bare Starlette app so it needs no database: what is under test is the door, not what
is behind it.
"""
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from api.proxy_guard import ProxySecretGuard, guard_state


def _app(secret: str) -> TestClient:
    async def hello(request):
        return JSONResponse({"ok": True})
    app = Starlette(routes=[Route("/health", hello), Route("/api/v1/thing", hello, methods=["GET", "POST"])])
    app.add_middleware(ProxySecretGuard, secret=secret)
    return TestClient(app)


def ok(cond, msg):
    assert cond, msg
    print(f"  ok  {msg}")


c = _app("s3cret")
ok(c.get("/api/v1/thing").status_code == 401, "no header -> 401")
ok(c.get("/api/v1/thing", headers={"X-Skypilot-Proxy": "wrong"}).status_code == 401, "wrong secret -> 401")
ok(c.get("/api/v1/thing", headers={"X-Skypilot-Proxy": "s3cret"}).status_code == 200, "right secret -> 200")
ok(c.post("/api/v1/thing", headers={"x-skypilot-proxy": "s3cret"}).status_code == 200, "header name case-insensitive, POST ok")
ok(c.post("/api/v1/thing").status_code == 401, "POST without header -> 401 (the write endpoints)")
ok(c.get("/health").status_code == 200, "/health open without secret")
ok(c.options("/api/v1/thing").status_code in (200, 405), "OPTIONS preflight passes the guard")

u = _app("")
ok(u.get("/api/v1/thing").status_code == 503, "UNCONFIGURED secret -> 503 (fail closed)")
ok("PROXY_SECRET" in u.get("/api/v1/thing").json()["detail"], "503 says which variable")
ok(u.get("/api/v1/thing", headers={"X-Skypilot-Proxy": ""}).status_code == 503,
   "empty header never matches an empty secret")
ok(u.get("/health").status_code == 200, "/health still open when unconfigured")
ok(guard_state("").startswith("UNCONFIGURED") and guard_state("x") == "configured", "guard_state wording")
print("\nall proxy guard tests passed")
