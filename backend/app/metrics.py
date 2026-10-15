"""Google Health API のレスポンスをダッシュボード用の形式に整形する。

各指標は {"date": "YYYY-MM-DD", ...} の配列で、期間内の全日付を含む
(データが無い日は値が null)。
"""

import asyncio
from datetime import date, datetime, timedelta

from .google_health import GoogleHealthClient, HealthApiError
from .oauth import NotAuthenticated


def date_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days)]


def _to_date(d: dict | None) -> date | None:
    if not d or "year" not in d:
        return None
    return date(d["year"], d.get("month", 1), d.get("day", 1))


def _num(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fill(days: list[date], by_date: dict[date, dict], empty: dict) -> list[dict]:
    return [{"date": d.isoformat(), **by_date.get(d, empty)} for d in days]


def _rollup_by_date(points: list[dict], field: str, extract) -> dict[date, dict]:
    result = {}
    for p in points:
        d = _to_date((p.get("civilStartTime") or {}).get("date"))
        value = p.get(field)
        if d is None or value is None:
            continue
        result[d] = extract(value)
    return result


# --- 日別ロールアップ系 ---------------------------------------------------


async def fetch_steps(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    points = await api.daily_rollup("steps", start, end)
    by_date = _rollup_by_date(points, "steps", lambda v: {"value": _num(v.get("countSum"))})
    return _fill(date_range(start, end), by_date, {"value": None})


async def fetch_distance(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    points = await api.daily_rollup("distance", start, end)

    def extract(v):
        mm = _num(v.get("millimetersSum"))
        return {"km": round(mm / 1_000_000, 2) if mm is not None else None}

    by_date = _rollup_by_date(points, "distance", extract)
    return _fill(date_range(start, end), by_date, {"km": None})


async def fetch_calories(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    points = await api.daily_rollup("total-calories", start, end)
    by_date = _rollup_by_date(
        points, "totalCalories", lambda v: {"kcal": _round(_num(v.get("kcalSum")))}
    )
    return _fill(date_range(start, end), by_date, {"kcal": None})


async def fetch_heart_rate(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    points = await api.daily_rollup("heart-rate", start, end)
    by_date = _rollup_by_date(
        points,
        "heartRate",
        lambda v: {
            "avg": _round(_num(v.get("beatsPerMinuteAvg"))),
            "min": _round(_num(v.get("beatsPerMinuteMin"))),
            "max": _round(_num(v.get("beatsPerMinuteMax"))),
        },
    )
    return _fill(date_range(start, end), by_date, {"avg": None, "min": None, "max": None})


async def fetch_zone_minutes(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    points = await api.daily_rollup("active-zone-minutes", start, end)

    def extract(v):
        fat_burn = _num(v.get("sumInFatBurnHeartZone")) or 0
        cardio = _num(v.get("sumInCardioHeartZone")) or 0
        peak = _num(v.get("sumInPeakHeartZone")) or 0
        return {"fatBurn": fat_burn, "cardio": cardio, "peak": peak}

    by_date = _rollup_by_date(points, "activeZoneMinutes", extract)
    return _fill(
        date_range(start, end), by_date, {"fatBurn": None, "cardio": None, "peak": None}
    )


async def fetch_weight(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    points = await api.daily_rollup("weight", start, end)

    def extract(v):
        grams = _num(v.get("weightGramsAvg"))
        return {"kg": round(grams / 1000, 1) if grams is not None else None}

    by_date = _rollup_by_date(points, "weight", extract)
    return _fill(date_range(start, end), by_date, {"kg": None})


# --- 日次サマリー系 (list + date フィルタ) ---------------------------------


def _daily_filter(data_type: str, start: date, end: date) -> str:
    # フィルタ内のデータ型名は snake_case (例: daily_resting_heart_rate)。
    # レスポンスJSONの camelCase で書くと INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION になる。
    # https://developers.google.com/health/filters
    name = data_type.replace("-", "_")
    return f'{name}.date >= "{start.isoformat()}" AND {name}.date < "{end.isoformat()}"'


async def _fetch_daily(api, data_type, field, start, end, extract, empty) -> list[dict]:
    points = await api.list_data_points(data_type, _daily_filter(data_type, start, end))
    by_date = {}
    for p in points:
        value = p.get(field)
        d = _to_date((value or {}).get("date"))
        if d is not None:
            by_date[d] = extract(value)
    return _fill(date_range(start, end), by_date, empty)


async def fetch_resting_heart_rate(api, start: date, end: date) -> list[dict]:
    return await _fetch_daily(
        api,
        "daily-resting-heart-rate",
        "dailyRestingHeartRate",
        start,
        end,
        lambda v: {"bpm": _num(v.get("beatsPerMinute"))},
        {"bpm": None},
    )


async def fetch_hrv(api, start: date, end: date) -> list[dict]:
    return await _fetch_daily(
        api,
        "daily-heart-rate-variability",
        "dailyHeartRateVariability",
        start,
        end,
        lambda v: {"ms": _round(_num(v.get("averageHeartRateVariabilityMilliseconds")), 1)},
        {"ms": None},
    )


async def fetch_spo2(api, start: date, end: date) -> list[dict]:
    return await _fetch_daily(
        api,
        "daily-oxygen-saturation",
        "dailyOxygenSaturation",
        start,
        end,
        lambda v: {
            "avg": _round(_num(v.get("averagePercentage")), 1),
            "min": _round(_num(v.get("lowerBoundPercentage")), 1),
            "max": _round(_num(v.get("upperBoundPercentage")), 1),
        },
        {"avg": None, "min": None, "max": None},
    )


# --- 睡眠 -------------------------------------------------------------------

STAGE_KEYS = {
    "DEEP": "deep",
    "LIGHT": "light",
    "REM": "rem",
    "AWAKE": "awake",
    "RESTLESS": "awake",
    "ASLEEP": "asleep",
}
SLEEP_EMPTY = {
    "minutesAsleep": None,
    "minutesInBed": None,
    "deep": None,
    "light": None,
    "rem": None,
    "awake": None,
    "asleep": None,
    "start": None,
    "end": None,
}


def _sleep_end_date(interval: dict) -> date | None:
    d = _to_date((interval.get("civilEndTime") or {}).get("date"))
    if d is not None:
        return d
    end_time = interval.get("endTime")
    if end_time:
        return datetime.fromisoformat(end_time.replace("Z", "+00:00")).date()
    return None


async def fetch_sleep(api: GoogleHealthClient, start: date, end: date) -> list[dict]:
    """起床日 (セッション終了日) ごとに睡眠を集計する。昼寝も合算する。"""
    filter_expr = (
        f'sleep.interval.civil_end_time >= "{start.isoformat()}" '
        f'AND sleep.interval.civil_end_time < "{end.isoformat()}"'
    )
    points = await api.list_data_points("sleep", filter_expr, page_size=25)

    by_date: dict[date, dict] = {}
    main_duration: dict[date, float] = {}
    for p in points:
        s = p.get("sleep") or {}
        interval = s.get("interval") or {}
        d = _sleep_end_date(interval)
        if d is None:
            continue
        summary = s.get("summary") or {}
        entry = by_date.setdefault(d, {k: None for k in SLEEP_EMPTY})

        def add(key, value):
            if value is not None:
                entry[key] = (entry[key] or 0) + value

        add("minutesAsleep", _num(summary.get("minutesAsleep")))
        add("minutesInBed", _num(summary.get("minutesInSleepPeriod")))
        for stage in summary.get("stagesSummary") or []:
            key = STAGE_KEYS.get(stage.get("type"))
            if key:
                add(key, _num(stage.get("minutes")))

        # 就寝・起床時刻は一番長いセッション (主睡眠) のものを使う
        duration = _num(summary.get("minutesInSleepPeriod")) or 0
        is_main = (s.get("metadata") or {}).get("mainSleep")
        if is_main or duration > main_duration.get(d, -1):
            main_duration[d] = float("inf") if is_main else duration
            entry["start"] = interval.get("startTime")
            entry["end"] = interval.get("endTime")

    return _fill(date_range(start, end), by_date, SLEEP_EMPTY)


# --- まとめて取得 -----------------------------------------------------------

FETCHERS = {
    "steps": fetch_steps,
    "distance": fetch_distance,
    "calories": fetch_calories,
    "heartRate": fetch_heart_rate,
    "restingHeartRate": fetch_resting_heart_rate,
    "hrv": fetch_hrv,
    "spo2": fetch_spo2,
    "zoneMinutes": fetch_zone_minutes,
    "sleep": fetch_sleep,
    "weight": fetch_weight,
}


async def fetch_all(
    api: GoogleHealthClient, start: date, end: date, names: list[str]
) -> tuple[dict, dict]:
    """指定した指標を並列取得する。1つの指標が失敗しても他は表示できるようにエラーを個別に返す。"""
    results = await asyncio.gather(
        *(FETCHERS[n](api, start, end) for n in names), return_exceptions=True
    )
    metrics, errors = {}, {}
    for name, result in zip(names, results):
        if isinstance(result, NotAuthenticated):
            raise result
        if isinstance(result, HealthApiError):
            errors[name] = f"{result.status}: {result.message}"
            metrics[name] = []
        elif isinstance(result, Exception):
            errors[name] = f"{type(result).__name__}: {result}"
            metrics[name] = []
        else:
            metrics[name] = result
    return metrics, errors


def _round(value: float | None, digits: int = 0):
    if value is None:
        return None
    return round(value, digits) if digits else round(value)
