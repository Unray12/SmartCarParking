export const API_BASE = (
  window.__APP_CONFIG__?.API_BASE ||
  window.location.origin ||
  'http://127.0.0.1:8010'
).replace(/\/+$/, '');

export const WS_BASE = API_BASE.replace(/^http/i, 'ws');

// ---- JWT token (Bearer) ----
const TOKEN_KEY = 'scp_token';
const USER_KEY = 'scp_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(token, username) {
  localStorage.setItem(TOKEN_KEY, token || '');
  if (username != null) localStorage.setItem(USER_KEY, username);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function getStoredUser() {
  return localStorage.getItem(USER_KEY) || '';
}

// WebSocket không tự gắn được header Authorization (browser `new WebSocket(url)` không
// cho set header tuỳ ý) - backend yêu cầu token qua query string ?token= cho endpoint này.
export function wsCameraUrl(cameraId) {
  const token = getToken();
  const base = `${WS_BASE}/ws/cameras/${cameraId}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// Cổng WebRTC (WHEP) của MediaMTX expose trên host - browser POST SDP offer thẳng tới đây.
// Có thể override qua config.js (window.__APP_CONFIG__.WEBRTC_BASE) khi đứng sau reverse-proxy.
const DEFAULT_WEBRTC_PORT = 8889;

// Dựng URL WHEP đầy đủ từ info do GET /api/v1/cameras/{id}/webrtc trả về. public_base ưu
// tiên (khi backend cấu hình sẵn); nếu rỗng thì suy ra từ host đang truy cập + cổng mặc
// định. Token JWT gắn qua query vì fetch WHEP cross-origin (cổng 8889) và MediaMTX xác thực
// bằng token trong query (browser không tự gắn Authorization cho POST cross-origin đơn giản).
export function buildWhepUrl(info) {
  if (!info || !info.path) return null;
  const configured = window.__APP_CONFIG__?.WEBRTC_BASE;
  const base = (info.public_base || configured || `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:${DEFAULT_WEBRTC_PORT}`).replace(/\/+$/, '');
  const token = getToken();
  const suffix = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/${info.path}/whep${suffix}`;
}

function isPublicAuthPath(path) {
  return path.includes('/auth/login') || path.includes('/auth/reset-password');
}

export async function api(path, options = {}) {
  const requestOptions = { ...options };
  const method = (requestOptions.method || 'GET').toUpperCase();
  const headers = { ...(requestOptions.headers || {}) };
  const timeoutMs = Number(requestOptions.timeoutMs || 12000);
  delete requestOptions.timeoutMs;

  if (!(requestOptions.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (method === 'GET') {
    requestOptions.cache = 'no-store';
    headers['Cache-Control'] = 'no-cache, no-store, max-age=0';
    headers.Pragma = 'no-cache';
    headers.Expires = '0';
  }
  requestOptions.headers = headers;

  let url = `${API_BASE}${path}`;
  if (method === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}_ts=${Date.now()}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  requestOptions.signal = controller.signal;

  try {
    const response = await fetch(url, requestOptions);

    // Token hết hạn / không hợp lệ → về trang login (trừ chính các API public của login).
    // Dùng 'login.html' tương đối để chạy được cả 2 chế độ: FE tĩnh (5173) hoặc BE serve (8010).
    if (response.status === 401 && !isPublicAuthPath(path)) {
      clearToken();
      if (!/login\.html$/.test(window.location.pathname)) {
        window.location.replace('login.html');
      }
    }

    if (!response.ok) {
      const clone = response.clone();
      let detail = `HTTP ${response.status}`;
      try {
        const body = await clone.json();
        detail = body.detail || body.message || detail;
      } catch {
        try {
          const text = await response.text();
          if (text && text.trim()) {
            detail = text.trim().slice(0, 220);
          }
        } catch {
          // ignore
        }
      }
      const httpError = new Error(detail);
      httpError.status = response.status;
      throw httpError;
    }

    if (response.status === 204) return null;
    return response.json();
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
