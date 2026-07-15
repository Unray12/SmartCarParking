// Trang Overview: KPI tổng quan + occupancy theo bãi + 2 bảng (xe đang gửi, biển số gần nhất).
import { api } from '../api.js';
import { els } from '../dom.js';
import { fmtDate, fmtMoney, occClass, occRate, escapeHtml } from '../ui.js';

export async function refreshDashboard() {
  const summary = await api('/api/v1/dashboard/summary');
  els.mCamerasTotal.textContent = summary.cameras_total;
  els.mCamerasOn.textContent = summary.cameras_enabled;
  els.mActive.textContent = summary.active_sessions;
  els.mCheckin.textContent = summary.today_checkins;
  els.mCheckout.textContent = summary.today_checkouts;

  const rate = Number(summary.occupancy_rate || 0);
  if (els.mOccupancy) els.mOccupancy.textContent = `${rate}%`;
  if (els.mOccupancyBar) els.mOccupancyBar.style.width = `${Math.min(100, rate)}%`;
  if (els.mRevenue) els.mRevenue.textContent = fmtMoney(summary.today_revenue, summary.currency);
}

export async function refreshActiveSessions() {
  const sessions = await api('/api/v1/sessions?active_only=true&limit=20');
  els.sessionBody.innerHTML = '';
  if (!sessions.length) {
    els.sessionBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có xe đang gửi</td></tr>';
    return;
  }
  for (const row of sessions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${escapeHtml(row.plate) || '-'}</td>
      <td>${escapeHtml(row.rfid_card)}</td>
      <td>${fmtDate(row.entry_time)}</td>
    `;
    els.sessionBody.appendChild(tr);
  }
}

export async function refreshRecentPlates() {
  const plates = await api('/api/v1/plates?limit=25');
  els.plateBody.innerHTML = '';
  if (!plates.length) {
    els.plateBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có biển số nào được nhận diện</td></tr>';
    return;
  }
  for (const row of plates) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.seen_at)}</td>
      <td>${escapeHtml(row.camera_name)}</td>
      <td>${escapeHtml(row.plate)}</td>
      <td>${row.linked ? 'Yes' : 'No'}</td>
    `;
    els.plateBody.appendChild(tr);
  }
}

// Render thanh tỉ lệ lấp đầy theo bãi (nhận lots từ module parking để tránh gọi API trùng).
export function renderOverviewLots(lots) {
  if (!els.overviewLotList) return;
  if (!lots || !lots.length) {
    els.overviewLotList.innerHTML = '<p class="empty">Chưa có bãi xe</p>';
    return;
  }
  els.overviewLotList.innerHTML = '';
  for (const lot of lots) {
    const occ = Number(lot.occupied || 0);
    const cap = Number(lot.capacity || 0);
    const rate = occRate(occ, cap);
    const row = document.createElement('div');
    row.className = 'occ-row';
    row.innerHTML = `
      <div class="occ-name">${escapeHtml(lot.name)}</div>
      <div class="occ-track"><div class="occ-fill ${occClass(rate)}" style="width:${rate}%"></div></div>
      <div class="occ-meta"><strong>${occ}</strong>/${cap} · ${rate}%</div>
    `;
    els.overviewLotList.appendChild(row);
  }
}

// Làm mới các chỉ số overview (không gồm occupancy — occupancy do parking.loadParkingLots đẩy sang).
export function refreshOverviewMetrics() {
  return Promise.all([refreshDashboard(), refreshActiveSessions(), refreshRecentPlates()]);
}
