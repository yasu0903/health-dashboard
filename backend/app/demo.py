"""Google アカウント未接続でも画面を確認できるようにするサンプルデータ。

日付をシードにした乱数で生成するので、同じ日付なら毎回同じ値になる。
"""

import math
import random
from datetime import date, datetime, time, timedelta, timezone

from .metrics import date_range


def _rng(d: date, salt: str) -> random.Random:
    return random.Random(f"{d.isoformat()}:{salt}")


def generate(start: date, end: date, tz) -> dict:
    days = date_range(start, end)
    steps, distance, calories, heart_rate, resting, hrv, spo2, zones, sleep, weight = (
        [] for _ in range(10)
    )

    for i, d in enumerate(days):
        r = _rng(d, "day")
        weekend = d.weekday() >= 5
        iso = d.isoformat()

        step_count = int(r.gauss(6500 if weekend else 9000, 2200))
        step_count = max(1200, step_count)
        steps.append({"date": iso, "value": step_count})
        distance.append({"date": iso, "km": round(step_count * 0.00072, 2)})

        fat_burn = max(0, int(r.gauss(22, 10)))
        cardio = max(0, int(r.gauss(8, 7)))
        peak = max(0, int(r.gauss(2, 3)))
        zones.append({"date": iso, "fatBurn": fat_burn, "cardio": cardio, "peak": peak})

        calories.append(
            {"date": iso, "kcal": int(1650 + step_count * 0.045 + (cardio + peak) * 6 + r.gauss(0, 60))}
        )

        trend = math.sin(i / 5)
        rhr = round(58 + trend * 1.5 + r.gauss(0, 1.2))
        resting.append({"date": iso, "bpm": rhr})
        heart_rate.append(
            {
                "date": iso,
                "avg": round(rhr + 14 + r.gauss(0, 2)),
                "min": rhr - 6 + r.randint(-2, 2),
                "max": round(120 + cardio * 1.5 + peak * 4 + r.gauss(0, 8)),
            }
        )
        hrv.append({"date": iso, "ms": round(42 - trend * 4 + r.gauss(0, 4), 1)})

        spo2_avg = round(min(99.5, r.gauss(96.4, 0.6)), 1)
        spo2.append(
            {"date": iso, "avg": spo2_avg, "min": round(spo2_avg - 2.3, 1), "max": round(min(100, spo2_avg + 1.4), 1)}
        )

        weight.append({"date": iso, "kg": round(65.2 - i * 0.03 + r.gauss(0, 0.25), 1)})

        sleep.append(_demo_sleep(d, tz))

    # 体重は毎日は測らない想定で間引く
    for i, w in enumerate(weight):
        if _rng(days[i], "weight").random() < 0.35:
            w["kg"] = None

    return {
        "steps": steps,
        "distance": distance,
        "calories": calories,
        "heartRate": heart_rate,
        "restingHeartRate": resting,
        "hrv": hrv,
        "spo2": spo2,
        "zoneMinutes": zones,
        "sleep": sleep,
        "weight": weight,
    }


def _demo_sleep(d: date, tz) -> dict:
    r = _rng(d, "sleep")
    bedtime_offset = r.gauss(23.4, 0.6)  # 前日の 23:24 前後に就寝
    in_bed = max(300, int(r.gauss(445, 40)))
    awake = max(15, int(r.gauss(48, 12)))
    asleep = in_bed - awake
    deep = int(asleep * r.uniform(0.13, 0.2))
    rem = int(asleep * r.uniform(0.18, 0.25))
    light = asleep - deep - rem

    bed_hour = int(bedtime_offset) % 24
    bed_minute = int((bedtime_offset % 1) * 60)
    bed_day = d - timedelta(days=1) if bedtime_offset < 24 else d
    start = datetime.combine(bed_day, time(bed_hour, bed_minute), tzinfo=tz)
    end = start + timedelta(minutes=in_bed)
    return {
        "date": d.isoformat(),
        "minutesAsleep": asleep,
        "minutesInBed": in_bed,
        "deep": deep,
        "light": light,
        "rem": rem,
        "awake": awake,
        "asleep": None,
        "start": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "end": end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
