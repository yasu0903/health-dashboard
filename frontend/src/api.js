export class UnauthorizedError extends Error {}

async function request(path, options) {
  const res = await fetch(path, options);
  if (res.status === 401) throw new UnauthorizedError("not_authenticated");
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // JSON 以外のエラーレスポンス
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const fetchStatus = () => request("/api/status");

export function fetchDashboard({ days, weight = false, refresh = false }) {
  const params = new URLSearchParams({ days: String(days) });
  if (weight) params.set("weight", "true");
  if (refresh) params.set("refresh", "true");
  return request(`/api/dashboard?${params}`);
}

export const logout = () => request("/auth/logout", { method: "POST" });
