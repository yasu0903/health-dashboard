import { average, clockTime, hoursMinutes, latest, longDate, number } from "../format.js";

export const STEP_GOAL = 8000;

export default function KpiCards({ metrics }) {
  const steps = latest(metrics.steps, "value");
  const distance = steps && metrics.distance.find((d) => d.date === steps.date);
  const sleep = latest(metrics.sleep, "minutesAsleep");
  const rhr = latest(metrics.restingHeartRate, "bpm");
  const hrv = latest(metrics.hrv, "ms");
  const calories = latest(metrics.calories, "kcal");
  const spo2 = latest(metrics.spo2, "avg");
  const weight = metrics.weight && latest(metrics.weight, "kg");
  const zones = latestZones(metrics.zoneMinutes);

  return (
    <section className="kpi-grid">
      <Kpi
        label="歩数"
        accent="var(--c-steps)"
        point={steps}
        value={number(steps?.value)}
        unit="歩"
        sub={distance?.km != null ? `${number(distance.km, 2)} km` : null}
        avg={average(metrics.steps, "value")}
        current={steps?.value}
        formatAvg={(v) => `${number(v)} 歩`}
      >
        {steps && <Progress value={steps.value} goal={STEP_GOAL} />}
      </Kpi>

      <Kpi
        label="睡眠"
        accent="var(--c-sleep)"
        point={sleep}
        value={hoursMinutes(sleep?.minutesAsleep)}
        sub={sleep?.start ? `${clockTime(sleep.start)} 〜 ${clockTime(sleep.end)}` : null}
        avg={average(metrics.sleep, "minutesAsleep")}
        current={sleep?.minutesAsleep}
        formatAvg={hoursMinutes}
      />

      <Kpi
        label="安静時心拍数"
        accent="var(--c-heart)"
        point={rhr}
        value={number(rhr?.bpm)}
        unit="bpm"
        avg={average(metrics.restingHeartRate, "bpm")}
        current={rhr?.bpm}
        formatAvg={(v) => `${number(v, 1)} bpm`}
        lowerIsBetter
      />

      <Kpi
        label="心拍変動 (HRV)"
        accent="var(--c-hrv)"
        point={hrv}
        value={number(hrv?.ms, 1)}
        unit="ms"
        avg={average(metrics.hrv, "ms")}
        current={hrv?.ms}
        formatAvg={(v) => `${number(v, 1)} ms`}
      />

      <Kpi
        label="消費カロリー"
        accent="var(--c-calories)"
        point={calories}
        value={number(calories?.kcal)}
        unit="kcal"
        avg={average(metrics.calories, "kcal")}
        current={calories?.kcal}
        formatAvg={(v) => `${number(v)} kcal`}
      />

      <Kpi
        label="アクティブゾーン"
        accent="var(--c-zone)"
        point={zones}
        value={number(zones?.total)}
        unit="分"
        sub={
          zones
            ? `脂肪燃焼 ${zones.fatBurn} / 有酸素 ${zones.cardio} / ピーク ${zones.peak}`
            : null
        }
      />

      <Kpi
        label="血中酸素 (SpO2)"
        accent="var(--c-spo2)"
        point={spo2}
        value={number(spo2?.avg, 1)}
        unit="%"
        sub={spo2?.min != null ? `範囲 ${number(spo2.min, 1)}〜${number(spo2.max, 1)}%` : null}
      />

      {metrics.weight && (
        <Kpi
          label="体重"
          accent="var(--c-weight)"
          point={weight}
          value={number(weight?.kg, 1)}
          unit="kg"
          avg={average(metrics.weight, "kg")}
          current={weight?.kg}
          formatAvg={(v) => `${number(v, 1)} kg`}
          neutralDelta
        />
      )}
    </section>
  );
}

function latestZones(series) {
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i];
    if (p.fatBurn != null || p.cardio != null || p.peak != null) {
      const fatBurn = p.fatBurn ?? 0;
      const cardio = p.cardio ?? 0;
      const peak = p.peak ?? 0;
      return { date: p.date, fatBurn, cardio, peak, total: fatBurn + cardio + peak };
    }
  }
  return null;
}

function Kpi({
  label,
  accent,
  point,
  value,
  unit,
  sub,
  avg,
  current,
  formatAvg,
  lowerIsBetter = false,
  neutralDelta = false,
  children,
}) {
  const empty = point == null;
  return (
    <article className="kpi" style={{ "--accent": accent }}>
      <header className="kpi-head">
        <span className="kpi-label">{label}</span>
        {point && <span className="kpi-date">{longDate(point.date)}</span>}
      </header>
      <div className="kpi-value">
        {empty ? <span className="muted">データなし</span> : value}
        {!empty && unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {avg != null && current != null && formatAvg && (
        <Delta
          current={current}
          avg={avg}
          format={formatAvg}
          lowerIsBetter={lowerIsBetter}
          neutral={neutralDelta}
        />
      )}
      {children}
    </article>
  );
}

function Delta({ current, avg, format, lowerIsBetter, neutral }) {
  const diff = current - avg;
  const ratio = avg ? Math.abs(diff / avg) : 0;
  let tone = "flat";
  if (!neutral && ratio >= 0.03) {
    tone = (diff > 0) !== lowerIsBetter ? "up" : "down";
  }
  const arrow = ratio < 0.03 ? "→" : diff > 0 ? "↑" : "↓";
  return (
    <div className={`kpi-delta delta-${tone}`}>
      {arrow} 期間平均 {format(avg)}
    </div>
  );
}

function Progress({ value, goal }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div title={`目標 ${goal.toLocaleString()} 歩`}>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">目標 {goal.toLocaleString()} 歩の {pct}%</span>
    </div>
  );
}
