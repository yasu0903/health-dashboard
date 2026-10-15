import { useCallback, useEffect, useState } from "react";
import { UnauthorizedError, fetchDashboard, fetchStatus, logout } from "./api.js";
import Header from "./components/Header.jsx";
import KpiCards from "./components/KpiCards.jsx";
import Charts from "./components/Charts.jsx";
import LoginPanel from "./components/LoginPanel.jsx";

const AUTH_ERRORS = {
  access_denied: "Google での認可がキャンセルされました。",
  invalid_state: "認可リクエストの検証に失敗しました。もう一度ログインしてください。",
  token_exchange_failed:
    "トークンの取得に失敗しました。クライアントID・シークレット・リダイレクトURIを確認してください。",
};

const SHOW_WEIGHT_KEY = "health-dashboard:showWeight";

function readShowWeight() {
  try {
    return localStorage.getItem(SHOW_WEIGHT_KEY) === "true";
  } catch {
    return false;
  }
}

function saveShowWeight(value) {
  try {
    localStorage.setItem(SHOW_WEIGHT_KEY, String(value));
  } catch {
    // ストレージが使えない環境では保存しない
  }
}

function readAuthError() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("auth_error");
  if (code) window.history.replaceState(null, "", window.location.pathname);
  return code ? (AUTH_ERRORS[code] ?? `認可エラー: ${code}`) : null;
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [days, setDays] = useState(14);
  const [showWeight, setShowWeight] = useState(readShowWeight);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authError] = useState(readAuthError);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch((e) => setError(`バックエンドに接続できません (${e.message})`));
  }, []);

  const needsLogin = status?.mode === "live" && !status.authenticated;

  const load = useCallback(
    async (refresh = false) => {
      if (!status || needsLogin) return;
      setLoading(true);
      setError(null);
      try {
        setData(await fetchDashboard({ days, weight: showWeight, refresh }));
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          setStatus((s) => ({ ...s, authenticated: false }));
          setData(null);
        } else {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [status, needsLogin, days, showWeight],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleShowWeightChange = (value) => {
    setShowWeight(value);
    saveShowWeight(value);
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    setData(null);
    setStatus((s) => ({ ...s, authenticated: false }));
  };

  return (
    <div className="app">
      <Header
        status={status}
        days={days}
        onDaysChange={setDays}
        showWeight={showWeight}
        onShowWeightChange={handleShowWeightChange}
        onRefresh={() => load(true)}
        onLogout={handleLogout}
        loading={loading}
        generatedAt={data?.generatedAt}
        showControls={!needsLogin && status != null}
      />

      <main className="content">
        {authError && <div className="banner banner-error">{authError}</div>}
        {error && <div className="banner banner-error">{error}</div>}

        {needsLogin ? (
          <LoginPanel />
        ) : data ? (
          <>
            {Object.keys(data.errors ?? {}).length > 0 && <MetricErrors errors={data.errors} />}
            <KpiCards metrics={data.metrics} />
            <Charts metrics={data.metrics} />
          </>
        ) : (
          !error && <div className="placeholder">読み込み中…</div>
        )}
      </main>
    </div>
  );
}

const METRIC_LABELS = {
  steps: "歩数",
  distance: "距離",
  calories: "消費カロリー",
  heartRate: "心拍数",
  restingHeartRate: "安静時心拍数",
  hrv: "心拍変動",
  spo2: "血中酸素",
  zoneMinutes: "アクティブゾーン",
  sleep: "睡眠",
  weight: "体重",
};

function MetricErrors({ errors }) {
  return (
    <details className="banner banner-warn">
      <summary>{Object.keys(errors).length} 件の指標を取得できませんでした(詳細)</summary>
      <ul>
        {Object.entries(errors).map(([key, message]) => (
          <li key={key}>
            <strong>{METRIC_LABELS[key] ?? key}</strong>: {message}
          </li>
        ))}
      </ul>
    </details>
  );
}
