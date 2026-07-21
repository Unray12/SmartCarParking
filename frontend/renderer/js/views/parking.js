// Trang Parking Lots: CRUD bãi, sức chứa/occupancy, ảnh chụp, chi tiết bãi (live + capture + log).
import { api } from '../api.js';
import { appState, loadNav, saveNav } from '../state.js';
import { els } from '../dom.js';
import { createStreamSession } from '../stream.js';
import { createJpegCanvasPlayer } from '../jpeg-stream.js';
import { notify, fmtDate, absoluteApiUrl, absoluteApiUrlNoCache, cameraNameById, occClass, occRate, escapeHtml, setStreamStatusChip, withButtonBusy } from '../ui.js';
import { confirmDialog } from '../confirm-dialog.js';

const lotDetailState = {
  selectedLotId: null,
  currentLot: null,
  // Mỗi hướng 1 phiên hiển thị độc lập (ưu tiên WebRTC, fallback JPEG). Trường hợp camera
  // vào == camera ra được xử lý đơn giản bằng 2 phiên cùng cameraId (MediaMTX tự fan-out),
  // thay cho cơ chế 1 socket vẽ 2 canvas trước đây.
  entrySession: null,
  exitSession: null,
  // Theo dõi camera mỗi hướng đang stream để poll định kỳ không tear-down (chống chớp khung).
  streamEntryCamId: null,
  streamExitCamId: null
};
const captureStatusTimers = { entry: null, exit: null };
// Dedup key riêng cho pulse "ok" (quẹt thành công) và pulse "warn" (quẹt bị từ chối) -
// PHẢI tách riêng 2 dict này. Nếu dùng chung 1 dict theo `kind`, mỗi lần đổi qua lại
// giữa 2 loại pulse (vd vừa có 1 lượt thành công cũ, giờ có 1 lượt bị từ chối) thì key
// của loại này sẽ luôn khác key của loại kia (khác prefix "ok:"/"warn:") -> dedup coi
// là "khác nhau" mỗi lần, khiến CẢ HAI hàm tự re-fire lẫn nhau ở MỌI lần poll tiếp theo
// (không chỉ 1 lần khi thật sự có sự kiện mới) - đã tự phát hiện bug này khi trace lại
// luồng polling định kỳ của trang.
const lastCapturePulseKeys = { entry: null, exit: null };
const lastRejectedPulseKeys = { entry: null, exit: null };
// Bãi đang được coi là "đã thiết lập baseline" cho cảnh báo quẹt bị từ chối - xem
// applyCaptureStatus. null = chưa thiết lập cho bất kỳ bãi nào (lần đầu mở app).
let rejectedBaselineLotId = null;

const hooks = { onLotsLoaded: null };

export function getSelectedLotId() {
  return lotDetailState.selectedLotId;
}

// ---- Lot form ----
export function resetLotForm() {
  els.lotEditId.value = '';
  els.lotFormTitle.textContent = 'Tạo bãi xe';
  els.lotSubmitBtn.textContent = 'Lưu bãi xe';
  els.lotForm.reset();
  els.lotAiEnabled.checked = false;
  if (els.lotCapacity) els.lotCapacity.value = '50';
  if (els.lotRfidPort) els.lotRfidPort.value = '';
}

function fillLotFormForEdit(lot) {
  els.lotEditId.value = String(lot.id);
  els.lotFormTitle.textContent = `Sửa bãi xe #${lot.id}`;
  els.lotSubmitBtn.textContent = 'Cập nhật bãi xe';
  els.lotName.value = lot.name;
  if (els.lotCapacity) els.lotCapacity.value = String(lot.capacity ?? 50);
  els.lotEntryCamera.value = lot.entry_camera_id ? String(lot.entry_camera_id) : '';
  els.lotExitCamera.value = lot.exit_camera_id ? String(lot.exit_camera_id) : '';
  els.lotAiEnabled.checked = Boolean(lot.ai_enabled);
  if (els.lotRfidPort) els.lotRfidPort.value = lot.rfid_usb_port || '';
}

// Đổ option camera cho select cổng vào/ra (gọi khi danh sách camera đổi).
export function renderLotCameraOptions() {
  const makeOptions = (selectEl, selectedValue = '') => {
    selectEl.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Không chỉ định';
    selectEl.appendChild(none);
    for (const cam of appState.cameras) {
      const opt = document.createElement('option');
      opt.value = String(cam.id);
      opt.textContent = `${cam.name} (#${cam.id})`;
      selectEl.appendChild(opt);
    }
    if (selectedValue) selectEl.value = selectedValue;
  };
  makeOptions(els.lotEntryCamera, els.lotEntryCamera.value);
  makeOptions(els.lotExitCamera, els.lotExitCamera.value);
}

function renderLotFilterOptions(lots) {
  els.snapshotLotFilter.innerHTML = '';
  els.rfidLot.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Tất cả bãi xe';
  els.snapshotLotFilter.appendChild(allOpt);

  const defaultLotOpt = document.createElement('option');
  defaultLotOpt.value = '';
  defaultLotOpt.textContent = 'Bãi mặc định (bãi đầu tiên)';
  els.rfidLot.appendChild(defaultLotOpt);

  for (const lot of lots) {
    const opt = document.createElement('option');
    opt.value = String(lot.id);
    opt.textContent = `${lot.name} (#${lot.id})`;
    els.snapshotLotFilter.appendChild(opt);

    const lotOpt = document.createElement('option');
    lotOpt.value = String(lot.id);
    lotOpt.textContent = `${lot.name} (#${lot.id})`;
    els.rfidLot.appendChild(lotOpt);
  }
}

// Xóa bãi xe. Nếu bãi còn phiên gửi xe (đang gửi hoặc lịch sử), backend trả 409 kèm số
// liệu cụ thể ("còn N xe đang gửi và tổng M phiên...") - hỏi lại người dùng bằng popup
// riêng chứa đúng thông tin đó, xác nhận thì xóa với force=true (giữ lại toàn bộ log,
// chỉ ngắt liên kết với bãi - xem parking_lots/service.py:delete_parking_lot).
async function deleteLotWithConfirm(lotId) {
  // Dữ liệu occupancy đã có sẵn từ danh sách bãi đang hiển thị (không cần gọi API thêm) -
  // cảnh báo ngay ở bước xác nhận ĐẦU TIÊN nếu bãi đang có xe gửi thực tế, thay vì chỉ biết
  // sau khi bị 409 (xem nhánh dưới - vẫn còn cho trường hợp chỉ còn lịch sử đã đóng).
  const lot = appState.parkingLots.find((l) => l.id === Number(lotId));
  const occupied = Number(lot?.occupied || 0);
  const agreed = await confirmDialog({
    title: occupied ? 'Bãi xe đang có xe gửi' : 'Xóa bãi xe',
    message: occupied
      ? `Bãi xe #${lotId} đang có ${occupied} xe gửi thực tế bên trong. Xóa bãi này KHÔNG làm mất dữ liệu xe, nhưng bãi sẽ biến mất khỏi hệ thống. Bạn có chắc chắn muốn xóa?`
      : `Xóa bãi xe #${lotId}?`,
    confirmText: 'Xóa',
    tone: 'danger',
  });
  if (!agreed) return;

  try {
    await api(`/api/v1/parking-lots/${lotId}`, { method: 'DELETE' });
    notify('Đã xóa bãi xe', 'success');
    await loadParkingLots();
    await refreshSnapshotList();
    return;
  } catch (err) {
    if (err.status !== 409) {
      notify(`Xóa bãi xe lỗi: ${err.message}`, 'error');
      return;
    }
    const stillAgreed = await confirmDialog({
      title: 'Bãi xe còn dữ liệu',
      message: `${err.message}\n\nLịch sử phiên/log sẽ được GIỮ LẠI (chỉ mất liên kết với bãi này).`,
      confirmText: 'Vẫn xóa',
      tone: 'danger',
    });
    if (!stillAgreed) return;
  }

  try {
    await api(`/api/v1/parking-lots/${lotId}?force=true`, { method: 'DELETE' });
    notify('Đã xóa bãi xe (đã giữ lại lịch sử)', 'success');
    await loadParkingLots();
    await refreshSnapshotList();
  } catch (err2) {
    notify(`Xóa bãi xe lỗi: ${err2.message}`, 'error');
  }
}

function renderParkingLots(lots) {
  els.lotBody.innerHTML = '';
  if (!lots.length) {
    els.lotBody.innerHTML = '<tr><td colspan="11" class="empty">Chưa có bãi xe</td></tr>';
    return;
  }

  for (const lot of lots) {
    const occ = Number(lot.occupied || 0);
    const cap = Number(lot.capacity || 0);
    const rate = occRate(occ, cap);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lot.id}</td>
      <td>${escapeHtml(lot.name)}</td>
      <td>${cap}</td>
      <td style="min-width:140px">
        <div class="occ-track"><div class="occ-fill ${occClass(rate)}" style="width:${rate}%"></div></div>
        <span class="occ-meta">${occ}/${cap} · ${rate}%</span>
      </td>
      <td>${escapeHtml(cameraNameById(lot.entry_camera_id))}</td>
      <td>${escapeHtml(cameraNameById(lot.exit_camera_id))}</td>
      <td>${lot.ai_enabled ? '<span class="chip chip-in">Bật</span>' : '<span class="chip chip-out">Tắt</span>'}</td>
      <td>${lot.rfid_usb_port ? escapeHtml(lot.rfid_usb_port) : '<span class="muted">mặc định</span>'}</td>
      <td><button class="ghost lot-manage-btn" data-lot-id="${lot.id}">Quản lý</button></td>
      <td><button class="ghost lot-edit-btn" data-lot-id="${lot.id}">Sửa</button></td>
      <td><button class="ghost lot-delete-btn" data-lot-id="${lot.id}">Xóa</button></td>
    `;
    els.lotBody.appendChild(tr);
  }

  for (const btn of els.lotBody.querySelectorAll('.lot-manage-btn')) {
    btn.addEventListener('click', async () => {
      await openParkingLotDetail(Number(btn.dataset.lotId));
    });
  }
  for (const btn of els.lotBody.querySelectorAll('.lot-edit-btn')) {
    btn.addEventListener('click', () => {
      const lot = appState.parkingLots.find((x) => x.id === Number(btn.dataset.lotId));
      if (lot) fillLotFormForEdit(lot);
    });
  }
  for (const btn of els.lotBody.querySelectorAll('.lot-delete-btn')) {
    btn.addEventListener('click', () => deleteLotWithConfirm(btn.dataset.lotId));
  }
}

export async function loadParkingLots() {
  const lots = await api('/api/v1/parking-lots');
  appState.parkingLots = lots;
  renderParkingLots(lots);
  renderLotFilterOptions(lots);
  hooks.onLotsLoaded?.(lots);
}

// ---- Live streams trong chi tiết bãi ----
function setLotPlaceholder(kind, text) {
  if (kind === 'entry') {
    els.lotEntryPlaceholder.textContent = text;
    els.lotEntryPlaceholder.style.display = 'block';
  } else {
    els.lotExitPlaceholder.textContent = text;
    els.lotExitPlaceholder.style.display = 'block';
  }
}

function lotEls(kind) {
  return kind === 'entry'
    ? { video: els.lotEntryVideo, canvas: els.lotEntryCanvas, placeholder: els.lotEntryPlaceholder, status: els.lotEntryStreamStatus }
    : { video: els.lotExitVideo, canvas: els.lotExitCanvas, placeholder: els.lotExitPlaceholder, status: els.lotExitStreamStatus };
}

// Fallback JPEG-over-WebSocket cho 1 hướng, vẽ lên canvas tương ứng. Trả { stop }. Tự mở
// lại nếu WS rớt trong lúc phiên vẫn đang chạy (stream.js không tự restart JPEG).
function openLotKind(kind, cameraId) {
  const { video, canvas, placeholder, status } = lotEls(kind);
  canvas.width = 1280;
  canvas.height = 720;

  if (!cameraId) {
    setLotPlaceholder(kind, kind === 'entry' ? 'Chưa có camera vào' : 'Chưa có camera ra');
    setStreamStatusChip(status, null);
    return null;
  }

  const session = createStreamSession({
    cameraId,
    video,
    canvas,
    showVideo: () => {
      video.classList.add('is-live');
      canvas.style.display = 'none';
      placeholder.style.display = 'none';
    },
    showCanvas: () => {
      video.classList.remove('is-live');
      canvas.style.display = '';
    },
    startJpeg: () => createJpegCanvasPlayer({
      cameraId,
      canvas,
      onFirstFrame: () => { placeholder.style.display = 'none'; }
    }),
    onMode: (mode) => setStreamStatusChip(status, mode)
  });
  session.start();
  return session;
}

function resetLotVideo(kind) {
  const { video, canvas, status } = lotEls(kind);
  if (video) video.classList.remove('is-live');
  if (canvas) canvas.style.display = '';
  setStreamStatusChip(status, null);
}

export function closeLotDetailStreams() {
  if (lotDetailState.entrySession) { lotDetailState.entrySession.stop(); lotDetailState.entrySession = null; }
  if (lotDetailState.exitSession) { lotDetailState.exitSession.stop(); lotDetailState.exitSession = null; }
  resetLotVideo('entry');
  resetLotVideo('exit');
  lotDetailState.streamEntryCamId = null;
  lotDetailState.streamExitCamId = null;
}

// Chỉ (re)tạo phiên khi cấu hình camera đổi → tránh chớp khung khi poll định kỳ. Mỗi phiên
// tự lo reconnect (WebRTC hoặc JPEG fallback) nên không cần theo dõi liveness socket nữa.
function ensureLotStreams(lot) {
  const entryCam = lot.entry_camera_id || null;
  const exitCam = lot.exit_camera_id || null;

  const entryOk = entryCam ? (lotDetailState.streamEntryCamId === entryCam && lotDetailState.entrySession) : !lotDetailState.entrySession;
  const exitOk = exitCam ? (lotDetailState.streamExitCamId === exitCam && lotDetailState.exitSession) : !lotDetailState.exitSession;
  if (entryOk && exitOk) return;

  closeLotDetailStreams();
  lotDetailState.entrySession = openLotKind('entry', entryCam);
  lotDetailState.exitSession = openLotKind('exit', exitCam);
  lotDetailState.streamEntryCamId = entryCam;
  lotDetailState.streamExitCamId = exitCam;
}

function renderLotDetailLogs(sessions) {
  els.lotDetailLogBody.innerHTML = '';
  const rows = [];
  for (const s of sessions) {
    rows.push({ at: s.entry_time, direction: 'in', plate: s.plate || '-', card: s.rfid_card, status: 'checked_in', aiMatch: null });
    if (s.exit_time) {
      rows.push({
        at: s.exit_time,
        direction: 'out',
        plate: s.plate || '-',
        card: s.rfid_card,
        status: 'checked_out',
        aiMatch: s.ai_plate_match ?? null,
        aiExitPlate: s.ai_exit_plate || null,
      });
    }
  }
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (!rows.length) {
    els.lotDetailLogBody.innerHTML = '<tr><td colspan="6" class="empty">Chưa có log in/out cho bãi này</td></tr>';
    return;
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const tr = document.createElement('tr');
    const directionLabel = row.direction === 'in' ? 'IN' : 'OUT';
    const statusLabel = row.status === 'checked_in' ? 'Đang gửi' : 'Đã ra';
    // Khi mismatch, kèm luôn biển AI đọc được lúc RA - cột "Biển số" ở dòng vào/ra luôn
    // hiển thị CÙNG 1 giá trị (biển chốt của session, không đổi trong suốt phiên) nên nếu
    // không hiện kèm biển AI thực tế đọc lúc ra, người xem sẽ không hiểu vì sao lại "Không
    // khớp" trong khi 2 dòng nhìn y hệt nhau.
    const aiLabel =
      row.aiMatch === null
        ? '-'
        : row.aiMatch
        ? '<span class="lot-log-chip lot-log-chip-in">Khớp</span>'
        : `<span class="lot-log-chip lot-log-chip-out">Không khớp</span>${row.aiExitPlate ? ` <span class="lot-log-ai-detected">(AI đọc: ${escapeHtml(row.aiExitPlate)})</span>` : ''}`;
    tr.className = `lot-log-row ${idx % 2 === 0 ? 'lot-log-even' : 'lot-log-odd'}`;
    tr.innerHTML = `
      <td>${fmtDate(row.at)}</td>
      <td><span class="lot-log-chip ${row.direction === 'in' ? 'lot-log-chip-in' : 'lot-log-chip-out'}">${directionLabel}</span></td>
      <td>${escapeHtml(row.plate)}</td>
      <td>${escapeHtml(row.card)}</td>
      <td><span class="lot-log-chip ${row.status === 'checked_in' ? 'lot-log-chip-in' : 'lot-log-chip-out'}">${statusLabel}</span></td>
      <td>${aiLabel}</td>
    `;
    els.lotDetailLogBody.appendChild(tr);
  }
}

// 3 trạng thái chip: 'ok' (xanh - quẹt thành công), 'off' (đỏ - đang không quét),
// 'warn' (vàng - quẹt bị TỪ CHỐI: already_in/not_found, xem pulseRejectedStatus).
function setCaptureStatusChip(el, state, label, message = null) {
  if (!el) return;
  el.classList.remove('is-ok', 'is-off', 'is-warn');
  el.classList.add(state === 'ok' ? 'is-ok' : state === 'warn' ? 'is-warn' : 'is-off');
  el.textContent = message || `${label}: ${state === 'ok' ? 'quét RFID OK' : 'đang không quét'}`;
}

// Xanh (quẹt OK) cố ý hiện LÂU HƠN vàng/đỏ (theo yêu cầu người dùng) - để có đủ thời gian
// quan sát kết quả quẹt thành công trước khi chip chuyển tiếp sang trạng thái khác.
const OK_PULSE_MS = 4000;
const WARN_PULSE_MS = 3000;

function pulseCaptureStatus(kind, ok, snapshot = null) {
  const target = kind === 'entry' ? els.lotEntryCaptureStatus : els.lotExitCaptureStatus;
  const label = kind === 'entry' ? 'RFID vào' : 'RFID ra';
  if (!ok) {
    setCaptureStatusChip(target, 'off', label);
    return;
  }
  const pulseKey = snapshot
    ? `ok:${snapshot.session_id || '-'}:${snapshot.direction || '-'}:${snapshot.timestamp || '-'}:${snapshot.image_url || '-'}`
    : null;
  if (pulseKey && lastCapturePulseKeys[kind] === pulseKey) return;
  if (pulseKey) lastCapturePulseKeys[kind] = pulseKey;
  setCaptureStatusChip(target, 'ok', label);
  if (captureStatusTimers[kind]) clearTimeout(captureStatusTimers[kind]);
  captureStatusTimers[kind] = setTimeout(() => {
    setCaptureStatusChip(target, 'off', label);
    captureStatusTimers[kind] = null;
  }, OK_PULSE_MS);
}

// Nhãn hiển thị cho lượt quẹt bị từ chối - already_in xảy ra khi quẹt HƯỚNG VÀO (đã có
// phiên mở, chưa quẹt ra) nên hiện ở chip "RFID vào"; not_found xảy ra khi quẹt HƯỚNG RA
// mà không tìm thấy phiên đang mở nên hiện ở chip "RFID ra" - xem rfid/service.py.
const REJECTED_RFID_MESSAGES = {
  already_in: 'Thẻ đã quẹt vào trước đó - chưa quẹt ra',
  not_found: 'Chưa quẹt vào - không tìm thấy phiên gửi',
};

function rejectedPulseKey(event) {
  return `warn:${event.card_id}:${event.direction}:${event.received_at}`;
}

function pulseRejectedStatus(event) {
  const kind = event.direction === 'in' ? 'entry' : 'exit';
  const target = kind === 'entry' ? els.lotEntryCaptureStatus : els.lotExitCaptureStatus;
  const label = kind === 'entry' ? 'RFID vào' : 'RFID ra';
  const pulseKey = rejectedPulseKey(event);
  if (lastRejectedPulseKeys[kind] === pulseKey) return;
  lastRejectedPulseKeys[kind] = pulseKey;
  const reason = REJECTED_RFID_MESSAGES[event.result_status] || event.result_status;
  setCaptureStatusChip(target, 'warn', label, `${label}: ${reason} (thẻ ${event.card_id})`);
  if (captureStatusTimers[kind]) clearTimeout(captureStatusTimers[kind]);
  captureStatusTimers[kind] = setTimeout(() => {
    setCaptureStatusChip(target, 'off', label);
    captureStatusTimers[kind] = null;
  }, WARN_PULSE_MS);
}

function setCaptureStatusIdle() {
  if (captureStatusTimers.entry) { clearTimeout(captureStatusTimers.entry); captureStatusTimers.entry = null; }
  if (captureStatusTimers.exit) { clearTimeout(captureStatusTimers.exit); captureStatusTimers.exit = null; }
  lastCapturePulseKeys.entry = null;
  lastCapturePulseKeys.exit = null;
  lastRejectedPulseKeys.entry = null;
  lastRejectedPulseKeys.exit = null;
  rejectedBaselineLotId = null;
  els.lotEntryCaptureImg.src = '';
  els.lotExitCaptureRefImg.src = '';
  els.lotExitCaptureImg.src = '';
  setCaptureStatusChip(els.lotEntryCaptureStatus, 'off', 'RFID vào');
  setCaptureStatusChip(els.lotExitCaptureStatus, 'off', 'RFID ra');
}

// Áp dụng kết quả từ endpoint NHẸ `/parking-lots/{id}/capture-status` (xem
// services.py:get_lot_capture_status) lên 2 ô capture + chip trạng thái. Ô "capture vào"
// và ô "capture ra" ĐỘC LẬP hoàn toàn với nhau - mỗi ô tự dùng đúng field của hướng nó,
// không suy luận chéo như code cũ (trước đây 1 hàm dùng chung 1 "sự kiện mới nhất" rồi
// suy luận ngược cho cả 2 ô, dễ ghi đè nhầm). Ô "capture ra" chia đôi: nửa trái hiện lại
// ảnh VÀO của ĐÚNG phiên vừa ra (đối chiếu), nửa phải hiện ảnh chụp thật lúc quẹt ra.
function applyCaptureStatus(status, lotId) {
  const latestIn = status?.latest_in || null;
  if (latestIn) {
    els.lotEntryCaptureImg.src = latestIn.image_url ? absoluteApiUrlNoCache(latestIn.image_url) : '';
    pulseCaptureStatus('entry', Boolean(latestIn.image_url), latestIn);
  } else {
    els.lotEntryCaptureImg.src = '';
    setCaptureStatusChip(els.lotEntryCaptureStatus, 'off', 'RFID vào');
  }

  const latestOut = status?.latest_out || null;
  if (latestOut) {
    const pairedIn = status?.paired_in_for_out || null;
    els.lotExitCaptureRefImg.src = pairedIn?.image_url ? absoluteApiUrlNoCache(pairedIn.image_url) : '';
    els.lotExitCaptureImg.src = latestOut.image_url ? absoluteApiUrlNoCache(latestOut.image_url) : '';
    pulseCaptureStatus('exit', Boolean(latestOut.image_url), latestOut);
  } else {
    els.lotExitCaptureRefImg.src = '';
    els.lotExitCaptureImg.src = '';
    setCaptureStatusChip(els.lotExitCaptureStatus, 'off', 'RFID ra');
  }

  // API trả "sự kiện bị từ chối GẦN NHẤT của bãi theo mỗi hướng" - KHÔNG có khái niệm
  // "mới phát sinh từ lúc mở trang" hay chưa, nên lần poll ĐẦU TIÊN sau khi mở/đổi bãi có
  // thể thấy 1 sự kiện đã xảy ra từ RẤT LÂU (vd lúc test tính năng) và hiểu nhầm là "vừa
  // xảy ra" rồi bắn cảnh báo sai lệch đè lên lượt quẹt hiện tại (đã tự phát hiện: y hệt
  // pattern `hasSyncedInitialLogs` đã dùng ở rfid.js). Sửa bằng cách "thiết lập baseline"
  // lặng lẽ (không pulse) ở lần poll đầu tiên cho MỖI bãi mới mở - chỉ coi là "mới" và
  // pulse cảnh báo từ lần poll thứ 2 trở đi.
  const isFirstLoadForLot = rejectedBaselineLotId !== lotId;
  if (isFirstLoadForLot) rejectedBaselineLotId = lotId;
  const rejectedIn = status?.rejected_in || null;
  const rejectedOut = status?.rejected_out || null;
  if (isFirstLoadForLot) {
    if (rejectedIn) lastRejectedPulseKeys.entry = rejectedPulseKey(rejectedIn);
    if (rejectedOut) lastRejectedPulseKeys.exit = rejectedPulseKey(rejectedOut);
    return;
  }
  if (rejectedIn) pulseRejectedStatus(rejectedIn);
  if (rejectedOut) pulseRejectedStatus(rejectedOut);
}

// Poll RIÊNG, tần suất cao (gần realtime) chỉ cho 2 ô capture + chip trạng thái - tách
// khỏi nhịp poll chậm hơn của `/overview` (điều khiển bởi appState.settings.refreshSeconds,
// dùng cho bảng log/occupancy/AI toggle - không cần realtime). Tự lên lịch kiểu
// setTimeout-sau-khi-xong (không phải setInterval) để không chồng lấn nếu 1 lần gọi API
// chậm hơn dự kiến (giống cách đã sửa cho AI Center live-test).
const CAPTURE_STATUS_POLL_MS = 1000;
let captureStatusPollingLotId = null;
let captureStatusPollTimer = null;

async function pollCaptureStatusLoop(lotId) {
  if (captureStatusPollingLotId !== lotId) return;
  try {
    const status = await api(`/api/v1/parking-lots/${lotId}/capture-status`);
    if (captureStatusPollingLotId !== lotId) return;
    applyCaptureStatus(status, lotId);
  } catch {
    // Bỏ qua lỗi thoáng qua (mất mạng tạm thời...) - vẫn tiếp tục poll, không dừng hẳn.
  }
  if (captureStatusPollingLotId !== lotId) return;
  captureStatusPollTimer = setTimeout(() => pollCaptureStatusLoop(lotId), CAPTURE_STATUS_POLL_MS);
}

function startCaptureStatusPolling(lotId) {
  if (captureStatusPollingLotId === lotId) return;
  stopCaptureStatusPolling();
  captureStatusPollingLotId = lotId;
  pollCaptureStatusLoop(lotId);
}

export function stopCaptureStatusPolling() {
  captureStatusPollingLotId = null;
  if (captureStatusPollTimer) {
    clearTimeout(captureStatusPollTimer);
    captureStatusPollTimer = null;
  }
}

export async function openParkingLotDetail(lotId) {
  let data;
  try {
    data = await api(`/api/v1/parking-lots/${lotId}/overview?limit=100`);
  } catch (err) {
    // Bãi (đã lưu phiên) không còn tồn tại -> bỏ chọn để khỏi cố mở lại mỗi nhịp poll.
    if (lotDetailState.selectedLotId === lotId) {
      lotDetailState.selectedLotId = null;
      saveNav({ selectedLotId: null });
    }
    throw err;
  }
  lotDetailState.selectedLotId = lotId;
  saveNav({ selectedLotId: lotId });  // giữ phiên: refresh vẫn mở lại đúng bãi này
  lotDetailState.currentLot = data.lot;
  els.lotDetailTitle.textContent = `Chi tiết bãi xe: ${data.lot.name} (#${data.lot.id})`;
  const rfidPortLabel = data.lot.rfid_usb_port ? data.lot.rfid_usb_port : 'mặc định (.env)';
  els.lotDetailMeta.textContent = `Cam vào: ${cameraNameById(data.lot.entry_camera_id)} | Cam ra: ${cameraNameById(data.lot.exit_camera_id)} | Cổng RFID: ${rfidPortLabel}`;
  els.lotDetailAiToggle.disabled = false;
  els.lotDetailAiToggle.checked = Boolean(data.lot.ai_enabled);
  renderLotDetailLogs(data.sessions || []);
  // 2 ô capture + chip trạng thái không còn lấy từ đây (nhịp poll chậm, theo
  // appState.settings.refreshSeconds) - đã tách sang poll riêng tần suất cao hơn hẳn, xem
  // startCaptureStatusPolling/CAPTURE_STATUS_POLL_MS.
  startCaptureStatusPolling(lotId);
  ensureLotStreams(data.lot);
}

export async function refreshSnapshotList() {
  const lotId = els.snapshotLotFilter.value;
  const query = lotId ? `?lot_id=${lotId}&limit=100` : '?limit=100';
  const rows = await api(`/api/v1/snapshots${query}`);

  els.snapshotBody.innerHTML = '';
  if (!rows.length) {
    els.snapshotBody.innerHTML = '<tr><td colspan="7" class="empty">Chưa có ảnh snapshot</td></tr>';
    return;
  }

  for (const row of rows) {
    const lotName = appState.parkingLots?.find((x) => x.id === row.lot_id)?.name || (row.lot_id ? `#${row.lot_id}` : '-');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(row.timestamp)}</td>
      <td>${escapeHtml(lotName)}</td>
      <td>${row.direction}</td>
      <td>${escapeHtml(row.plate)}</td>
      <td>${escapeHtml(row.rfid_card)}</td>
      <td>${escapeHtml(cameraNameById(row.camera_id))}</td>
      <td><a href="${absoluteApiUrl(row.image_url)}" target="_blank" rel="noopener">Xem ảnh</a></td>
    `;
    els.snapshotBody.appendChild(tr);
  }
}

export function initParking(opts = {}) {
  hooks.onLotsLoaded = opts.onLotsLoaded || null;

  // Khôi phục bãi đang mở chi tiết từ phiên trước: chỉ set id, switchView('parking') ở
  // main.js sẽ tự openParkingLotDetail nếu getSelectedLotId() có giá trị (và bãi còn tồn tại).
  const savedLotId = loadNav().selectedLotId;
  if (savedLotId) lotDetailState.selectedLotId = savedLotId;

  els.lotForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = els.lotName.value.trim();
    if (!name) return;
    const editId = els.lotEditId.value ? Number(els.lotEditId.value) : null;
    const method = editId ? 'PUT' : 'POST';
    const path = editId ? `/api/v1/parking-lots/${editId}` : '/api/v1/parking-lots';

    const submitBtn = ev.submitter || els.lotSubmitBtn;
    try {
      await withButtonBusy(submitBtn, 'Đang lưu…', () => api(path, {
        method,
        body: JSON.stringify({
          name,
          capacity: els.lotCapacity && els.lotCapacity.value !== '' ? Number(els.lotCapacity.value) : 50,
          entry_camera_id: els.lotEntryCamera.value ? Number(els.lotEntryCamera.value) : null,
          exit_camera_id: els.lotExitCamera.value ? Number(els.lotExitCamera.value) : null,
          ai_enabled: Boolean(els.lotAiEnabled.checked),
          rfid_usb_port: els.lotRfidPort && els.lotRfidPort.value.trim() ? els.lotRfidPort.value.trim() : null,
        }),
      }));
      notify(editId ? 'Cập nhật bãi xe thành công' : 'Tạo bãi xe thành công', 'success');
      resetLotForm();
      await loadParkingLots();
      await refreshSnapshotList();
      if (editId) await openParkingLotDetail(editId);
    } catch (err) {
      notify(`Lưu bãi xe lỗi: ${err.message}`, 'error');
    }
  });

  els.lotCancelEditBtn.addEventListener('click', resetLotForm);

  els.lotDetailCloseBtn.addEventListener('click', () => {
    lotDetailState.selectedLotId = null;
    saveNav({ selectedLotId: null });
    lotDetailState.currentLot = null;
    closeLotDetailStreams();
    stopCaptureStatusPolling();
    els.lotDetailTitle.textContent = 'Chi tiết bãi xe';
    els.lotDetailMeta.textContent = 'Chọn bãi xe từ danh sách để xem dữ liệu riêng.';
    els.lotDetailAiToggle.checked = false;
    els.lotDetailAiToggle.disabled = true;
    els.lotDetailLogBody.innerHTML = '<tr><td colspan="6" class="empty">Chưa có dữ liệu</td></tr>';
    setCaptureStatusIdle();
    setLotPlaceholder('entry', 'Chưa có camera vào');
    setLotPlaceholder('exit', 'Chưa có camera ra');
  });

  els.lotDetailAiToggle.addEventListener('change', async () => {
    const lot = lotDetailState.currentLot;
    if (!lot) return;
    const nextEnabled = els.lotDetailAiToggle.checked;
    try {
      await api(`/api/v1/parking-lots/${lot.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: lot.name,
          capacity: lot.capacity,
          entry_camera_id: lot.entry_camera_id,
          exit_camera_id: lot.exit_camera_id,
          ai_enabled: nextEnabled,
          rfid_usb_port: lot.rfid_usb_port ?? null,
        }),
      });
      lotDetailState.currentLot = { ...lot, ai_enabled: nextEnabled };
      notify(nextEnabled ? 'Đã bật AI nhận diện cho bãi này' : 'Đã tắt AI nhận diện cho bãi này', 'success');
      await loadParkingLots();
    } catch (err) {
      els.lotDetailAiToggle.checked = !nextEnabled;
      notify(`Đổi trạng thái AI lỗi: ${err.message}`, 'error');
    }
  });

  els.snapshotLotFilter.addEventListener('change', () => {
    refreshSnapshotList().catch((err) => notify(`Snapshot lỗi: ${err.message}`, 'error'));
  });
  els.snapshotRefreshBtn.addEventListener('click', () => {
    refreshSnapshotList()
      .then(() => notify('Đã làm mới snapshot', 'success'))
      .catch((err) => notify(`Snapshot lỗi: ${err.message}`, 'error'));
  });
}
