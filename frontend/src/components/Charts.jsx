import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { average, hasData, hoursMinutes, longDate, number, shortDate } from "../format.js";
import { STEP_GOAL } from "./KpiCards.jsx";

const COLORS = {
  steps: "#3b82f6",
  heart: "#ef4444",
  heartRange: "#fca5a5",
  resting: "#be123c",
  deep: "#3730a3",
  light: "#818cf8",
  rem: "#38bdf8",
  awake: "#f59e0b",
  asleep: "#6366f1",
  calories: "#f97316",
  fatBurn: "#facc15",
  cardio: "#fb923c",
  peak: "#dc2626",
  weight: "#10b981",
  hrv: "#8b5cf6",
  spo2: "#06b6d4",
};

const AXIS = { fontSize: 12, fill: "#8a94a6" };
const GRID = "rgba(138, 148, 166, 0.2)";
const TOOLTIP = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 13,
  },
  labelFormatter: (iso) => longDate(iso),
  cursor: { fill: "rgba(138, 148, 166, 0.12)" },
};

export default function Charts({ metrics }) {
  return (
    <section className="chart-grid">
      <StepsChart data={metrics.steps} />
      <SleepChart data={metrics.sleep} />
      <HeartChart heartRate={metrics.heartRate} resting={metrics.restingHeartRate} />
      <ZoneChart data={metrics.zoneMinutes} />
      <CaloriesChart data={metrics.calories} />
      <HrvChart data={metrics.hrv} />
      <Spo2Chart data={metrics.spo2} />
      {metrics.weight && <WeightChart data={metrics.weight} />}
    </section>
  );
}

function ChartCard({ title, summary, empty, wide = false, children }) {
  return (
    <article className={`chart-card ${wide ? "wide" : ""}`}>
      <header className="chart-head">
        <h3>{title}</h3>
        {summary && <span className="chart-summary">{summary}</span>}
      </header>
      <div className="chart-body">
        {empty ? (
          <div className="chart-empty">この期間のデータがありません</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}

function xAxis() {
  return <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} minTickGap={12} />;
}

function StepsChart({ data }) {
  const avg = average(data, "value");
  return (
    <ChartCard
      title="歩数"
      summary={avg != null ? `平均 ${number(avg)} 歩/日` : null}
      empty={!hasData(data, ["value"])}
      wide
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip {...TOOLTIP} formatter={(v) => [`${number(v)} 歩`, "歩数"]} />
        <ReferenceLine
          y={STEP_GOAL}
          stroke={COLORS.steps}
          strokeDasharray="4 4"
          label={{ value: "目標", position: "insideTopRight", fill: COLORS.steps, fontSize: 12 }}
        />
        <Bar dataKey="value" fill={COLORS.steps} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartCard>
  );
}

function SleepChart({ data }) {
  const rows = data.map((d) => ({
    date: d.date,
    deep: toHours(d.deep),
    light: toHours(d.light),
    rem: toHours(d.rem),
    asleep: toHours(d.asleep),
    awake: toHours(d.awake),
    minutesAsleep: d.minutesAsleep,
  }));
  const avg = average(data, "minutesAsleep");
  const hasClassic = hasData(data, ["asleep"]);
  return (
    <ChartCard
      title="睡眠"
      summary={avg != null ? `平均 ${hoursMinutes(avg)}` : null}
      empty={!hasData(data, ["minutesAsleep"])}
      wide
    >
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} unit="h" />
        <Tooltip {...TOOLTIP} formatter={(v, name) => [hoursMinutes(v * 60), name]} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="deep" name="深い睡眠" stackId="s" fill={COLORS.deep} maxBarSize={36} />
        <Bar dataKey="light" name="浅い睡眠" stackId="s" fill={COLORS.light} maxBarSize={36} />
        <Bar dataKey="rem" name="レム睡眠" stackId="s" fill={COLORS.rem} maxBarSize={36} />
        {hasClassic && (
          <Bar dataKey="asleep" name="睡眠" stackId="s" fill={COLORS.asleep} maxBarSize={36} />
        )}
        <Bar dataKey="awake" name="覚醒" stackId="s" fill={COLORS.awake} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartCard>
  );
}

function HeartChart({ heartRate, resting }) {
  const restingByDate = Object.fromEntries(resting.map((r) => [r.date, r.bpm]));
  const rows = heartRate.map((h) => ({
    date: h.date,
    range: h.min != null && h.max != null ? [h.min, h.max] : null,
    avg: h.avg,
    resting: restingByDate[h.date] ?? null,
  }));
  // heartRate が取れず安静時心拍だけある場合にも表示する
  for (const r of resting) {
    if (!rows.some((row) => row.date === r.date)) {
      rows.push({ date: r.date, range: null, avg: null, resting: r.bpm });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const avgResting = average(resting, "bpm");
  return (
    <ChartCard
      title="心拍数"
      summary={avgResting != null ? `安静時 平均 ${number(avgResting, 1)} bpm` : null}
      empty={!rows.some((r) => r.avg != null || r.resting != null)}
      wide
    >
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} domain={niceDomain(5, 10)} allowDecimals={false} />
        <Tooltip
          {...TOOLTIP}
          formatter={(v, name) => [Array.isArray(v) ? `${v[0]}〜${v[1]} bpm` : `${v} bpm`, name]}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area
          dataKey="range"
          name="最低〜最高"
          fill={COLORS.heartRange}
          fillOpacity={0.35}
          stroke="none"
          connectNulls
        />
        <Line dataKey="avg" name="平均" stroke={COLORS.heart} strokeWidth={2} dot={false} connectNulls />
        <Line
          dataKey="resting"
          name="安静時"
          stroke={COLORS.resting}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
    </ChartCard>
  );
}

function ZoneChart({ data }) {
  return (
    <ChartCard title="アクティブゾーン (分)" empty={!hasData(data, ["fatBurn", "cardio", "peak"])}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip {...TOOLTIP} formatter={(v, name) => [`${v} 分`, name]} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="fatBurn" name="脂肪燃焼" stackId="z" fill={COLORS.fatBurn} maxBarSize={28} />
        <Bar dataKey="cardio" name="有酸素" stackId="z" fill={COLORS.cardio} maxBarSize={28} />
        <Bar dataKey="peak" name="ピーク" stackId="z" fill={COLORS.peak} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartCard>
  );
}

function CaloriesChart({ data }) {
  const avg = average(data, "kcal");
  return (
    <ChartCard
      title="消費カロリー"
      summary={avg != null ? `平均 ${number(avg)} kcal` : null}
      empty={!hasData(data, ["kcal"])}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip {...TOOLTIP} formatter={(v) => [`${number(v)} kcal`, "消費カロリー"]} />
        <Bar dataKey="kcal" fill={COLORS.calories} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartCard>
  );
}

function HrvChart({ data }) {
  const avg = average(data, "ms");
  return (
    <ChartCard
      title="心拍変動 (HRV)"
      summary={avg != null ? `平均 ${number(avg, 1)} ms` : null}
      empty={!hasData(data, ["ms"])}
    >
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={niceDomain(2, 5)} allowDecimals={false} />
        <Tooltip {...TOOLTIP} formatter={(v) => [`${v} ms`, "HRV"]} />
        <Line dataKey="ms" stroke={COLORS.hrv} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ChartCard>
  );
}

function Spo2Chart({ data }) {
  const rows = data.map((d) => ({
    date: d.date,
    avg: d.avg,
    range: d.min != null && d.max != null ? [d.min, d.max] : null,
  }));
  return (
    <ChartCard title="血中酸素 (SpO2)" empty={!hasData(data, ["avg"])}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={[88, 100]} ticks={[88, 92, 96, 100]} unit="%" />
        <Tooltip
          {...TOOLTIP}
          formatter={(v, name) => [Array.isArray(v) ? `${v[0]}〜${v[1]}%` : `${v}%`, name]}
        />
        <Area dataKey="range" name="範囲" fill={COLORS.spo2} fillOpacity={0.15} stroke="none" connectNulls />
        <Line dataKey="avg" name="平均" stroke={COLORS.spo2} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ChartCard>
  );
}

function WeightChart({ data }) {
  const measured = data.filter((d) => d.kg != null);
  const change =
    measured.length >= 2 ? measured[measured.length - 1].kg - measured[0].kg : null;
  return (
    <ChartCard
      title="体重"
      summary={change != null ? `期間内 ${change >= 0 ? "+" : ""}${number(change, 1)} kg` : null}
      empty={measured.length === 0}
      wide
    >
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis()}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={niceDomain(0.5, 1)} allowDecimals={false} />
        <Tooltip {...TOOLTIP} formatter={(v) => [`${v} kg`, "体重"]} />
        <Line dataKey="kg" stroke={COLORS.weight} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ChartCard>
  );
}

/** 目盛りが切りの良い値になるよう、余白を足して step 単位に丸めた軸範囲 */
function niceDomain(padding, step) {
  return [
    (min) => Math.floor((min - padding) / step) * step,
    (max) => Math.ceil((max + padding) / step) * step,
  ];
}

function toHours(minutes) {
  return minutes == null ? null : Math.round((minutes / 60) * 100) / 100;
}
