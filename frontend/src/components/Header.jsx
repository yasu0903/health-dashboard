const PERIODS = [7, 14, 30, 90];

export default function Header({
  status,
  days,
  onDaysChange,
  showWeight,
  onShowWeightChange,
  onRefresh,
  onLogout,
  loading,
  generatedAt,
  showControls,
}) {
  const isDemo = status?.mode === "demo";

  return (
    <header className="header">
      <div className="header-title">
        <h1>Health Dashboard</h1>
        {(isDemo || status?.authenticated) && (
          <span className={`badge ${isDemo ? "badge-demo" : "badge-live"}`}>
            {isDemo ? "デモデータ" : "Google Health 接続中"}
          </span>
        )}
      </div>

      {showControls && (
        <div className="header-controls">
          <div className="segmented" role="group" aria-label="表示期間">
            {PERIODS.map((p) => (
              <button
                key={p}
                className={p === days ? "active" : ""}
                onClick={() => onDaysChange(p)}
                aria-pressed={p === days}
              >
                {p}日
              </button>
            ))}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showWeight}
              onChange={(e) => onShowWeightChange(e.target.checked)}
            />
            <span>体重を表示</span>
          </label>
          <button className="btn" onClick={onRefresh} disabled={loading} title={updatedLabel(generatedAt)}>
            {loading ? "更新中…" : "更新"}
          </button>
          {status?.mode === "live" && status.authenticated && (
            <button className="btn btn-ghost" onClick={onLogout}>
              接続解除
            </button>
          )}
        </div>
      )}
    </header>
  );
}

function updatedLabel(generatedAt) {
  if (!generatedAt) return "";
  return `最終取得: ${new Date(generatedAt).toLocaleString("ja-JP")}`;
}
