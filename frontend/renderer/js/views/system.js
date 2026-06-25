// Trang System: health check backend.
import { api, API_BASE } from '../api.js';
import { els } from '../dom.js';
import { notify } from '../ui.js';

export async function runHealthCheck(showNotice = true) {
  const started = new Date().toISOString();
  const data = await api('/health');
  els.healthResult.textContent = JSON.stringify(
    { checked_at: started, api_base: API_BASE, result: data },
    null,
    2
  );
  if (showNotice) notify('Backend health OK', 'success');
}

export function initSystem() {
  els.healthCheckBtn.addEventListener('click', () => {
    runHealthCheck(true).catch((err) => notify(`Health check lỗi: ${err.message}`, 'error'));
  });
}
