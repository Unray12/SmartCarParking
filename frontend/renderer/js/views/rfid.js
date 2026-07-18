// Trang RFID: gửi sự kiện test, quản lý thẻ, log kết quả gần nhất.
import { api } from '../api.js';
import { appState } from '../state.js';
import { els } from '../dom.js';
import { notify, showScanTick, fmtDate, fmtMoney, fmtDuration, escapeHtml } from '../ui.js';

const seenCaptureEventKeys = new Set();
const seenRejectedEventKeys = new Set();
const hooks = { onEvent: null };

// Lần poll ĐẦU TIÊN sau khi load trang chỉ để đồng bộ "đã biết" các log cũ (trong cửa sổ
// 24h) vào 2 Set trên - KHÔNG bắn toast cho chúng. Nếu không có cờ này, Set luôn rỗng lúc
// vừa load trang (bị reset theo phiên trình duyệt) nên mọi log cũ chưa "seen" sẽ bị hiểu
// nhầm là vừa mới xảy ra và bắn toast lại mỗi lần load/refresh trang - dù sự kiện đó đã
// xảy ra từ lâu. Chỉ từ lần poll thứ 2 (sự kiện thật sự mới phát sinh sau khi mở trang)
// mới bắn toast.
let hasSyncedInitialLogs = false;

// Nhãn hiển thị cho result_status trả về từ backend (RfidEventResult.status) - dùng
// chung cho cả bảng log lẫn toast thông báo, để user luôn hiểu rõ quẹt thẻ có hiệu
// lực hay bị từ chối (ví dụ quẹt VÀO lần 2 khi thẻ chưa quẹt RA).
export const RFID_STATUS_LABELS = {
  checked_in: 'Đã ghi nhận xe VÀO',
  checked_out: 'Đã ghi nhận xe RA',
  already_in: 'Thẻ đã quẹt VÀO trước đó (chưa quẹt RA) - bỏ qua',
  not_found: 'Không tìm thấy phiên gửi đang mở cho thẻ này',
  plate_mismatch: 'Biển số quẹt RA không khớp lúc VÀO',
  session_in: 'Xe đã ghi nhận VÀO',
  session_out: 'Xe đã ghi nhận RA',
};

// Status bị từ chối/không tạo phiên mới - cần cảnh báo rõ cho user, không chỉ log âm thầm.
const REJECTED_STATUSES = new Set(['already_in', 'not_found', 'plate_mismatch']);

export function renderRfidLogs() {
  els.rfidLogBody.innerHTML = '';
  if (!appState.rfidLogs.length) {
    els.rfidLogBody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có log RFID</td></tr>';
    return;
  }
  for (const item of appState.rfidLogs) {
    const tr = document.createElement('tr');
    const statusLabel = RFID_STATUS_LABELS[item.status] || item.status;
    tr.innerHTML = `
      <td>${fmtDate(item.at)}</td>
      <td>${escapeHtml(item.card_id)}</td>
      <td class="${REJECTED_STATUSES.has(item.status) ? 'rfid-log-rejected' : ''}">${statusLabel}</td>
      <td>${escapeHtml(item.plate) || '-'}</td>
    `;
    els.rfidLogBody.appendChild(tr);
  }
}

export async function refreshRfidEventLogs() {
  try {
    const logs = await api('/api/v1/logs?hours=24&limit=50');
    const mapped = [];
    for (const row of logs) {
      if (row.type !== 'rfid_in' && row.type !== 'rfid_out' && row.type !== 'session_in' && row.type !== 'session_out') {
        continue;
      }
      const details = row.details || {};
      const snapshotUrl = details.exit_snapshot_url || details.entry_snapshot_url || null;
      if ((row.type === 'session_in' || row.type === 'session_out') && snapshotUrl) {
        const key = `${row.type}:${details.session_id || '-'}:${snapshotUrl}`;
        if (!seenCaptureEventKeys.has(key)) {
          seenCaptureEventKeys.add(key);
          if (hasSyncedInitialLogs) {
            showScanTick(`RFID ${row.type === 'session_in' ? 'vào' : 'ra'} thành công`);
            notify(`RFID ${row.type === 'session_in' ? 'vào' : 'ra'} đã capture ảnh`, 'success');
          }
        }
      }
      // rfid_in/rfid_out mang result_status thật (checked_in/already_in/not_found/...) -
      // báo riêng cho user biết lần quẹt này có bị từ chối không (ví dụ quẹt VÀO lần 2
      // khi thẻ chưa quẹt RA), kể cả khi quẹt từ đầu đọc thật (không qua form test trên web).
      if ((row.type === 'rfid_in' || row.type === 'rfid_out') && REJECTED_STATUSES.has(details.result_status)) {
        const key = `reject:${row.type}:${details.card_id}:${row.timestamp}`;
        if (!seenRejectedEventKeys.has(key)) {
          seenRejectedEventKeys.add(key);
          if (hasSyncedInitialLogs) {
            const label = RFID_STATUS_LABELS[details.result_status] || details.result_status;
            showScanTick(`Thẻ ${details.card_id}: ${label}`);
            notify(`Quẹt thẻ ${details.card_id}: ${label}`, 'warn');
          }
        }
      }
      mapped.push({
        at: row.timestamp,
        card_id: details.card_id || details.rfid_card || '-',
        status: details.result_status || row.type,
        plate: details.plate || '-',
      });
      if (mapped.length >= 30) break;
    }
    hasSyncedInitialLogs = true;
    appState.rfidLogs = mapped;
    renderRfidLogs();
  } catch (err) {
    if (appState.currentView === 'rfid') notify(`RFID logs lỗi: ${err.message}`, 'warn');
  }
}

export async function loadRfidCards() {
  try {
    appState.rfidCards = await api('/api/v1/rfid/cards');
    renderRfidCards();
  } catch (err) {
    notify(`Load RFID cards lỗi: ${err.message}`, 'error');
  }
}

function renderRfidCards() {
  els.rfidCardBody.innerHTML = '';
  if (!appState.rfidCards || !appState.rfidCards.length) {
    els.rfidCardBody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có thẻ RFID nào được đăng ký</td></tr>';
    return;
  }
  for (const card of appState.rfidCards) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(card.card_id)}</td>
      <td>${escapeHtml(card.plate)}</td>
      <td>${escapeHtml(card.owner_name) || '-'}</td>
      <td>${card.is_active ? 'Hoạt động' : 'Khóa'}</td>
      <td><button class="ghost delete-card-btn" data-card-id="${escapeHtml(card.card_id)}">Xóa</button></td>
    `;
    els.rfidCardBody.appendChild(tr);
  }
  for (const btn of els.rfidCardBody.querySelectorAll('.delete-card-btn')) {
    btn.addEventListener('click', async () => {
      const cardId = btn.dataset.cardId;
      if (!confirm(`Xóa thẻ ${cardId}?`)) return;
      try {
        await api(`/api/v1/rfid/cards/${cardId}`, { method: 'DELETE' });
        notify('Xóa thẻ thành công', 'success');
        await loadRfidCards();
      } catch (err) {
        notify(`Xóa thẻ lỗi: ${err.message}`, 'error');
      }
    });
  }
}

// hooks.onEvent: gọi sau khi gửi sự kiện RFID (để làm mới overview/lịch sử).
export function initRfid(opts = {}) {
  hooks.onEvent = opts.onEvent || null;

  els.rfidForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cardId = els.rfidCard.value.trim();
    const direction = els.rfidDirection.value;
    const lotIdRaw = els.rfidLot.value;
    const plate = els.rfidPlate.value.trim();
    const source = els.rfidSource.value.trim() || 'web-rfid-tester';
    if (!cardId) return;

    try {
      const result = await api('/api/v1/rfid-events', {
        method: 'POST',
        body: JSON.stringify({
          card_id: cardId,
          direction,
          lot_id: lotIdRaw ? Number(lotIdRaw) : null,
          plate: plate || null,
          source,
          data: { by: 'web-dashboard' }
        })
      });

      appState.rfidLogs.unshift({ ...result, at: new Date().toISOString(), card_id: cardId });
      appState.rfidLogs = appState.rfidLogs.slice(0, 30);
      renderRfidLogs();

      const feeText = (result.fee != null)
        ? ` · Phí: ${fmtMoney(result.fee, result.currency || '')}${result.duration_minutes != null ? ' (' + fmtDuration(result.duration_minutes) + ')' : ''}`
        : '';
      const aiText = result.ai_plate_match === true
        ? ' · AI: khớp biển số'
        : result.ai_plate_match === false
          ? ` · AI: KHÔNG khớp biển số${result.ai_exit_plate ? ` (AI đọc: ${result.ai_exit_plate})` : ''} (xem lại)`
          : '';
      const statusLabel = RFID_STATUS_LABELS[result.status] || result.status;
      const capText = result.snapshot_path ? ' và đã capture ảnh' : '';
      const noticeType = REJECTED_STATUSES.has(result.status) || result.ai_plate_match === false ? 'warn' : 'success';
      showScanTick(`Thẻ ${cardId}: ${statusLabel}`);
      notify(`${statusLabel}${capText}${feeText}${aiText}`, noticeType);

      els.rfidPlate.value = '';
      if (hooks.onEvent) await hooks.onEvent();
      await refreshRfidEventLogs();
    } catch (err) {
      notify(`RFID lỗi: ${err.message}`, 'error');
    }
  });

  els.rfidCardForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cardId = els.rfidCardId.value.trim();
    const plate = els.rfidCardPlate.value.trim();
    const owner = els.rfidCardOwner.value.trim();
    if (!cardId || !plate) return;

    try {
      await api('/api/v1/rfid/cards', {
        method: 'POST',
        body: JSON.stringify({ card_id: cardId, plate, owner_name: owner || null })
      });
      notify('Thêm thẻ RFID thành công', 'success');
      els.rfidCardForm.reset();
      await loadRfidCards();
    } catch (err) {
      notify(`Thêm thẻ lỗi: ${err.message}`, 'error');
    }
  });
}
