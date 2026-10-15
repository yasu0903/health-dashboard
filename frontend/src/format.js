const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shortDate(iso) {
  const d = parseDate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function longDate(iso) {
  const d = parseDate(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

export function clockTime(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function hoursMinutes(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

export function number(value, digits = 0) {
  if (value == null) return "—";
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 値が入っている最新の要素を返す */
export function latest(series, key) {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i][key] != null) return series[i];
  }
  return null;
}

export function average(series, key) {
  const values = series.map((p) => p[key]).filter((v) => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function hasData(series, keys) {
  return series.some((p) => keys.some((k) => p[k] != null));
}
