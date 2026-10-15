import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo


def _bool(value: str | None, default: bool) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


# 読み取り専用スコープのみを要求する
SCOPES = [
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
]


@dataclass(frozen=True)
class Settings:
    client_id: str
    client_secret: str
    redirect_uri: str
    app_base_url: str
    demo_mode: bool
    timezone: ZoneInfo
    data_dir: Path
    cache_ttl_seconds: int


def load_settings() -> Settings:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    app_base_url = os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")
    # クライアントIDが未設定ならデモモードで起動する
    demo_mode = _bool(os.getenv("DEMO_MODE"), default=not (client_id and client_secret))
    return Settings(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=os.getenv("OAUTH_REDIRECT_URI", f"{app_base_url}/auth/callback"),
        app_base_url=app_base_url,
        demo_mode=demo_mode,
        timezone=ZoneInfo(os.getenv("TZ", "Asia/Tokyo")),
        data_dir=Path(os.getenv("DATA_DIR", "/data")),
        cache_ttl_seconds=int(os.getenv("CACHE_TTL_SECONDS", "300")),
    )


settings = load_settings()
