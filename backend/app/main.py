import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from . import demo, oauth
from .config import settings
from .google_health import GoogleHealthClient
from .metrics import FETCHERS, fetch_all

STATE_COOKIE = "oauth_state"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=30)
    app.state.cache = {}
    yield
    await app.state.http.aclose()


app = FastAPI(title="Health Dashboard API", lifespan=lifespan)


def _is_authenticated() -> bool:
    return oauth.token_store.load() is not None


@app.get("/api/healthz")
async def healthz():
    return {"ok": True}


@app.get("/api/status")
async def status():
    return {
        "mode": "demo" if settings.demo_mode else "live",
        "authenticated": (not settings.demo_mode) and _is_authenticated(),
        "timezone": str(settings.timezone),
    }


@app.get("/api/dashboard")
async def dashboard(
    request: Request,
    days: int = Query(14, ge=1, le=90),
    weight: bool = False,
    refresh: bool = False,
):
    today = datetime.now(settings.timezone).date()
    end = today + timedelta(days=1)  # 今日を含める
    start = end - timedelta(days=days)
    # 体重は画面で「表示する」を選んだときだけ取得する
    names = [n for n in FETCHERS if n != "weight" or weight]

    payload = {
        "source": "demo" if settings.demo_mode else "google-health-api",
        "range": {"start": start.isoformat(), "end": today.isoformat(), "days": days},
    }

    if settings.demo_mode:
        generated = demo.generate(start, end, settings.timezone)
        return {
            **payload,
            "generatedAt": datetime.now(settings.timezone).isoformat(),
            "metrics": {n: generated[n] for n in names},
            "errors": {},
        }

    if not _is_authenticated():
        raise HTTPException(status_code=401, detail="not_authenticated")

    # キャッシュは指標ごとに持つ。体重の表示を切り替えても他の指標は取り直さない
    cache = request.app.state.cache
    now = time.time()
    for key in [k for k, v in cache.items() if now - v[0] >= settings.cache_ttl_seconds]:
        del cache[key]
    missing = [n for n in names if refresh or (start, end, n) not in cache]

    if missing:
        api = GoogleHealthClient(request.app.state.http)
        try:
            fetched, fetch_errors = await fetch_all(api, start, end, missing)
        except oauth.NotAuthenticated:
            raise HTTPException(status_code=401, detail="not_authenticated")
        for n in missing:
            cache[(start, end, n)] = (now, fetched[n], fetch_errors.get(n))

    entries = {n: cache[(start, end, n)] for n in names}
    oldest = min(fetched_at for fetched_at, _, _ in entries.values())
    return {
        **payload,
        "generatedAt": datetime.fromtimestamp(oldest, settings.timezone).isoformat(),
        "metrics": {n: data for n, (_, data, _) in entries.items()},
        "errors": {n: err for n, (_, _, err) in entries.items() if err},
    }


@app.get("/auth/login")
async def login():
    if settings.demo_mode:
        raise HTTPException(
            status_code=400,
            detail="デモモードで起動しています。.env に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定してください。",
        )
    state = secrets.token_urlsafe(24)
    resp = RedirectResponse(oauth.build_authorization_url(state))
    resp.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax")
    return resp


@app.get("/auth/callback")
async def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    expected_state = request.cookies.get(STATE_COOKIE)
    if error:
        return _redirect_home(f"auth_error={error}")
    if not code or not state or not expected_state or not secrets.compare_digest(state, expected_state):
        return _redirect_home("auth_error=invalid_state")
    try:
        await oauth.exchange_code(request.app.state.http, code)
    except httpx.HTTPError:
        return _redirect_home("auth_error=token_exchange_failed")
    request.app.state.cache.clear()
    return _redirect_home()


@app.post("/auth/logout")
async def logout(request: Request):
    await oauth.revoke(request.app.state.http)
    request.app.state.cache.clear()
    return JSONResponse({"ok": True})


def _redirect_home(query: str = "") -> RedirectResponse:
    url = f"{settings.app_base_url}/" + (f"?{query}" if query else "")
    resp = RedirectResponse(url)
    resp.delete_cookie(STATE_COOKIE)
    return resp
