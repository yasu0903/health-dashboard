"""Google Health API (v4) の薄いクライアント。

https://developers.google.com/health/reference/rest
"""

from datetime import date, timedelta

import httpx

from .oauth import NotAuthenticated, get_access_token

BASE_URL = "https://health.googleapis.com/v4/users/me/dataTypes"

# dailyRollUp の1リクエストで指定できる最大日数
# (heart-rate / total-calories / active-minutes / calories-in-heart-rate-zone は14日、それ以外は90日)
ROLLUP_MAX_DAYS = {
    "heart-rate": 14,
    "total-calories": 14,
    "active-minutes": 14,
    "calories-in-heart-rate-zone": 14,
}
DEFAULT_ROLLUP_MAX_DAYS = 90
MAX_PAGES = 20


class HealthApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def civil_date_time(d: date) -> dict:
    return {
        "date": {"year": d.year, "month": d.month, "day": d.day},
        "time": {"hours": 0, "minutes": 0, "seconds": 0},
    }


class GoogleHealthClient:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http

    async def _request(self, method: str, url: str, **kwargs) -> dict:
        token = await get_access_token(self.http)
        resp = await self.http.request(
            method, url, headers={"Authorization": f"Bearer {token}"}, **kwargs
        )
        if resp.status_code == 401:
            raise NotAuthenticated()
        if resp.is_error:
            try:
                message = resp.json()["error"]["message"]
            except (ValueError, KeyError, TypeError):
                message = resp.text[:300]
            raise HealthApiError(resp.status_code, message)
        return resp.json() if resp.content else {}

    async def daily_rollup(self, data_type: str, start: date, end: date) -> list[dict]:
        """[start, end) の日別集計を返す。上限日数を超える期間は分割して取得する。"""
        max_days = ROLLUP_MAX_DAYS.get(data_type, DEFAULT_ROLLUP_MAX_DAYS)
        url = f"{BASE_URL}/{data_type}/dataPoints:dailyRollUp"
        points: list[dict] = []
        chunk_start = start
        while chunk_start < end:
            chunk_end = min(chunk_start + timedelta(days=max_days), end)
            body = {
                "range": {
                    "start": civil_date_time(chunk_start),
                    "end": civil_date_time(chunk_end),
                },
                "windowSizeDays": 1,
            }
            for _ in range(MAX_PAGES):
                data = await self._request("POST", url, json=body)
                points.extend(data.get("rollupDataPoints", []))
                next_token = data.get("nextPageToken")
                if not next_token:
                    break
                body["pageToken"] = next_token
            chunk_start = chunk_end
        return points

    async def list_data_points(
        self, data_type: str, filter_expr: str, page_size: int | None = None
    ) -> list[dict]:
        url = f"{BASE_URL}/{data_type}/dataPoints"
        params: dict = {"filter": filter_expr}
        if page_size:
            params["pageSize"] = page_size
        points: list[dict] = []
        for _ in range(MAX_PAGES):
            data = await self._request("GET", url, params=params)
            points.extend(data.get("dataPoints", []))
            next_token = data.get("nextPageToken")
            if not next_token:
                break
            params["pageToken"] = next_token
        return points
