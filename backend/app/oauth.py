"""Google OAuth 2.0 の認可フローとトークン保存。

ローカルで1人が使う前提のため、トークンは /data/token.json に1件だけ保存する。
"""

import asyncio
import json
import time
from urllib.parse import urlencode

import httpx

from .config import SCOPES, settings

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"


class NotAuthenticated(Exception):
    pass


class TokenStore:
    def __init__(self, path):
        self.path = path
        self._lock = asyncio.Lock()

    def load(self) -> dict | None:
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def save(self, token: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(token))
        tmp.chmod(0o600)
        tmp.replace(self.path)

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)

    @property
    def lock(self) -> asyncio.Lock:
        return self._lock


token_store = TokenStore(settings.data_dir / "token.json")


def build_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.client_id,
        "redirect_uri": settings.redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        # refresh_token を確実に受け取るため毎回同意画面を出す
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


def _with_expiry(payload: dict) -> dict:
    payload["expires_at"] = time.time() + int(payload.get("expires_in", 3600))
    return payload


async def exchange_code(client: httpx.AsyncClient, code: str) -> None:
    resp = await client.post(
        TOKEN_ENDPOINT,
        data={
            "code": code,
            "client_id": settings.client_id,
            "client_secret": settings.client_secret,
            "redirect_uri": settings.redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    resp.raise_for_status()
    token_store.save(_with_expiry(resp.json()))


async def get_access_token(client: httpx.AsyncClient) -> str:
    """有効なアクセストークンを返す。期限切れ間近ならリフレッシュする。"""
    async with token_store.lock:
        token = token_store.load()
        if not token:
            raise NotAuthenticated()
        if token.get("expires_at", 0) - 60 > time.time():
            return token["access_token"]

        refresh_token = token.get("refresh_token")
        if not refresh_token:
            token_store.clear()
            raise NotAuthenticated()
        resp = await client.post(
            TOKEN_ENDPOINT,
            data={
                "client_id": settings.client_id,
                "client_secret": settings.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if resp.status_code in (400, 401):
            # refresh_token が失効・取り消し済み
            token_store.clear()
            raise NotAuthenticated()
        resp.raise_for_status()
        refreshed = _with_expiry(resp.json())
        # リフレッシュ応答には refresh_token が含まれないことがあるので引き継ぐ
        refreshed.setdefault("refresh_token", refresh_token)
        token_store.save(refreshed)
        return refreshed["access_token"]


async def revoke(client: httpx.AsyncClient) -> None:
    token = token_store.load()
    token_store.clear()
    if not token:
        return
    try:
        await client.post(
            REVOKE_ENDPOINT,
            data={"token": token.get("refresh_token") or token.get("access_token")},
        )
    except httpx.HTTPError:
        pass
