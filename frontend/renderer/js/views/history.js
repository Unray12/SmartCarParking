// Trang Sessions + Plate Reads: bảng lịch sử + tìm kiếm/lọc client-side.
import { api } from '../api.js';
import { els } from '../dom.js';
import { notify, fmtDate, fmtDuration, fmtMoney, escapeHtml } from '../ui.js';

let allSessions = [];
let allPlates = [];

export function renderSessionsTable() {
  const q = (els.sessionsSearch?.value || '').trim().toLowerCase();
  const rows = q
    ? allSessions.filter((r) =>
        (r.plate || '').toLowerCase().includes(q) || (r.rfid_card || '').toLowerCase().includes(q))
    : allSessions;

  els.historySessionBody.innerHTML = '';
  if (!rows.length) {
    els.historySessionBody.innerHTML = '<tr><td colspan="8" class="empty">Không có dữ liệu phiên xe</td></tr>';
    return;
  }
  for (const row of rows) {
    const statusChip = row.status === 'in'
      ? '<span class="chip chip-in">Đang gửi</span>'
      : '<span class="chip chip-out">Đã ra</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${escapeHtml(row.plate) || '-'}</td>
      <td>${escapeHtml(row.rfid_card)}</td>
      <td>${fmtDate(row.entry_time)}</td>
      <td>${fmtDate(row.exit_time)}</td>
      <td>${fmtDuration(row.duration_minutes)}</td>
      <td class="fee-val">${fmtMoney(row.fee, row.currency)}</td>
      <td>${statusChip}</td>
    `;
    els.historySessionBody.appendChild(tr);
  }
}

export function renderPlatesTable() {
  const q = (els.platesSearch?.value || '').trim().toLowerCase();
  const rows = q
    ? allPlates.filter((r) =>
        (r.plate || '').toLowerCase().includes(q) || (r.camera_name || '').toLowerCase().includes(q))
    : allPlates;

  els.historyPlateBody.innerHTML = '';
  if (!rows.length) {
    els.historyPlateBody.innerHTML = '<tr><td colspan="5" class="empty">Không có dữ liệu nhận diện</td></tr>';
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.seen_at)}</td>
      <td>${escapeHtml(row.camera_name)}</td>
      <td>${escapeHtml(row.plate)}</td>
      <td>${row.confidence == null ? '-' : row.confidence.toFixed(3)}</td>
      <td>${row.linked ? '<span class="chip chip-in">Yes</span>' : '<span class="chip chip-out">No</span>'}</td>
    `;
    els.historyPlateBody.appendChild(tr);
  }
}

export async function refreshSessions() {
  const limit = Number(els.historyLimit.value || 50);
  const activeOnly = els.historyActiveOnly.checked;
  allSessions = await api(`/api/v1/sessions?active_only=${activeOnly}&limit=${limit}`);
  renderSessionsTable();
}

export async function refreshPlates() {
  const limit = Number(els.historyLimit?.value || 50);
  allPlates = await api(`/api/v1/plates?limit=${limit}`);
  renderPlatesTable();
}

export function initHistory() {
  els.historyRefreshBtn.addEventListener('click', () => {
    refreshSessions()
      .then(() => notify('Đã làm mới phiên xe', 'success'))
      .catch((err) => notify(`Sessions lỗi: ${err.message}`, 'error'));
  });
  els.historyActiveOnly.addEventListener('change', () => {
    refreshSessions().catch((err) => notify(`Sessions lỗi: ${err.message}`, 'error'));
  });
  els.historyLimit.addEventListener('change', () => {
    refreshSessions().catch((err) => notify(`Sessions lỗi: ${err.message}`, 'error'));
  });
  if (els.sessionsSearch) els.sessionsSearch.addEventListener('input', renderSessionsTable);
  if (els.platesSearch) els.platesSearch.addEventListener('input', renderPlatesTable);
  if (els.platesRefreshBtn) {
    els.platesRefreshBtn.addEventListener('click', () => {
      refreshPlates()
        .then(() => notify('Đã làm mới nhận diện', 'success'))
        .catch((err) => notify(`Plate reads lỗi: ${err.message}`, 'error'));
    });
  }
}
