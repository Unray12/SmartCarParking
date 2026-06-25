// Trang Parking Lots: CRUD bãi, sức chứa/occupancy, ảnh chụp, chi tiết bãi (live + capture + log).
import { api, WS_BASE } from '../api.js';
import { appState } from '../state.js';
import { els } from '../dom.js';
import { notify, fmtDate, absoluteApiUrl, absoluteApiUrlNoCache, cameraNameById, occClass, occRate } from '../ui.js';

const lotDetailState = {
  selectedLotId: null,
  entryWs: null,
  exitWs: null,
  sharedWs: null,
  // Theo dõi camera mỗi socket đang stream để poll định kỳ không tear-down WS (chống chớp khung).
  streamEntryCamId: null,
  streamExitCamId: null,
  streamSharedCamId: null
};
const captureStatusTimers = { entry: null, exit: null };
const lastCapturePulseKeys = { entry: null, exit: null };

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
  els.lotIsActive.checked = true;
  if (els.lotCapacity) els.lotCapacity.value = '50';
}

function fillLotFormForEdit(lot) {
  els.lotEditId.value = String(lot.id);
  els.lotFormTitle.textContent = `Sửa bãi xe #${lot.id}`;
  els.lotSubmitBtn.textContent = 'Cập nhật bãi xe';
  els.lotName.value = lot.name;
  if (els.lotCapacity) els.lotCapacity.value = String(lot.capacity ?? 50);
  els.lotEntryCamera.value = lot.entry_camera_id ? String(lot.entry_camera_id) : '';
  els.lotExitCamera.value = lot.exit_camera_id ? String(lot.exit_camera_id) : '';
  els.lotIsActive.checked = Boolean(lot.is_active);
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
  defaultLotOpt.textContent = 'Bãi mặc định (active)';
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

function renderParkingLots(lots) {
  els.lotBody.innerHTML = '';
  if (!lots.length) {
    els.lotBody.innerHTML = '<tr><td colspan="10" class="empty">Chưa có bãi xe</td></tr>';
    return;
  }

  for (const lot of lots) {
    const occ = Number(lot.occupied || 0);
    const cap = Number(lot.capacity || 0);
    const rate = occRate(occ, cap);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lot.id}</td>
      <td>${lot.name}</td>
      <td>${cap}</td>
      <td style="min-width:140px">
        <div class="occ-track"><div class="occ-fill ${occClass(rate)}" style="width:${rate}%"></div></div>
        <span class="occ-meta">${occ}/${cap} · ${rate}%</span>
      </td>
      <td>${cameraNameById(lot.entry_camera_id)}</td>
      <td>${cameraNameById(lot.exit_camera_id)}</td>
      <td>${lot.is_active ? '<span class="chip chip-in">Active</span>' : '<span class="chip chip-out">Inactive</span>'}</td>
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
    btn.addEventListener('click', async () => {
      const lotId = btn.dataset.lotId;
      if (!confirm(`Xóa bãi xe #${lotId}?`)) return;
      try {
        await api(`/api/v1/parking-lots/${lotId}`, { method: 'DELETE' });
        notify('Đã xóa bãi xe', 'success');
        await loadParkingLots();
        await refreshSnapshotList();
      } catch (err) {
        notify(`Xóa bãi xe lỗi: ${err.message}`, 'error');
      }
    });
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
function closeLotWs(ws) {
  if (!ws) return null;
  // Gỡ handler trước khi close để không nháy placeholder "Mất kết nối camera".
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close();
  return null;
}

function setLotPlaceholder(kind, text) {
  if (kind === 'entry') {
    els.lotEntryPlaceholder.textContent = text;
    els.lotEntryPlaceholder.style.display = 'block';
  } else {
    els.lotExitPlaceholder.textContent = text;
    els.lotExitPlaceholder.style.display = 'block';
  }
}

function openLotStream(kind, cameraId) {
  const canvas = kind === 'entry' ? els.lotEntryCanvas : els.lotExitCanvas;
  const placeholder = kind === 'entry' ? els.lotEntryPlaceholder : els.lotExitPlaceholder;
  const ctx = canvas.getContext('2d');
  canvas.width = 1280;
  canvas.height = 720;

  if (!cameraId) {
    setLotPlaceholder(kind, kind === 'entry' ? 'Chưa có camera vào' : 'Chưa có camera ra');
    return;
  }

  let pendingFrame = null;
  let decoding = false;
  let animFrameId = null;

  const ws = new WebSocket(`${WS_BASE}/ws/cameras/${cameraId}`);
  ws.binaryType = 'arraybuffer';

  async function consumeFrame() {
    animFrameId = null;
    if (decoding) return;
    decoding = true;

    const frame = pendingFrame;
    pendingFrame = null;

    if (frame) {
      const blob = new Blob([frame], { type: 'image/jpeg' });
      const bmp = await createImageBitmap(blob);
      placeholder.style.display = 'none';
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
    }

    decoding = false;
    if (pendingFrame && !decoding) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(console.error));
    }
  }

  ws.onmessage = (ev) => {
    pendingFrame = ev.data;
    if (!decoding && !animFrameId) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(console.error));
    }
  };

  ws.onclose = () => {
    pendingFrame = null;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    setLotPlaceholder(kind, 'Mất kết nối camera');
  };

  if (kind === 'entry') lotDetailState.entryWs = ws;
  else lotDetailState.exitWs = ws;
}

function openSharedLotStream(cameraId) {
  const entryCtx = els.lotEntryCanvas.getContext('2d');
  const exitCtx = els.lotExitCanvas.getContext('2d');
  els.lotEntryCanvas.width = 1280;
  els.lotEntryCanvas.height = 720;
  els.lotExitCanvas.width = 1280;
  els.lotExitCanvas.height = 720;

  let pendingFrame = null;
  let decoding = false;
  let animFrameId = null;

  const ws = new WebSocket(`${WS_BASE}/ws/cameras/${cameraId}`);
  ws.binaryType = 'arraybuffer';

  async function consumeFrame() {
    animFrameId = null;
    if (decoding) return;
    decoding = true;

    const frame = pendingFrame;
    pendingFrame = null;

    if (frame) {
      const blob = new Blob([frame], { type: 'image/jpeg' });
      const bmp = await createImageBitmap(blob);
      els.lotEntryPlaceholder.style.display = 'none';
      els.lotExitPlaceholder.style.display = 'none';
      entryCtx.drawImage(bmp, 0, 0, els.lotEntryCanvas.width, els.lotEntryCanvas.height);
      exitCtx.drawImage(bmp, 0, 0, els.lotExitCanvas.width, els.lotExitCanvas.height);
      bmp.close();
    }

    decoding = false;
    if (pendingFrame && !decoding) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(() => null));
    }
  }

  ws.onmessage = (ev) => {
    pendingFrame = ev.data;
    if (!decoding && !animFrameId) {
      animFrameId = requestAnimationFrame(() => consumeFrame().catch(() => null));
    }
  };

  ws.onclose = () => {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    setLotPlaceholder('entry', 'Mất kết nối camera');
    setLotPlaceholder('exit', 'Mất kết nối camera');
  };

  lotDetailState.sharedWs = ws;
}

export function closeLotDetailStreams() {
  lotDetailState.sharedWs = closeLotWs(lotDetailState.sharedWs);
  lotDetailState.entryWs = closeLotWs(lotDetailState.entryWs);
  lotDetailState.exitWs = closeLotWs(lotDetailState.exitWs);
  lotDetailState.streamEntryCamId = null;
  lotDetailState.streamExitCamId = null;
  lotDetailState.streamSharedCamId = null;
}

// Chỉ (re)connect khi cấu hình camera đổi hoặc socket chết → tránh chớp khung khi poll.
function ensureLotStreams(lot) {
  const entryCam = lot.entry_camera_id || null;
  const exitCam = lot.exit_camera_id || null;
  const useShared = Boolean(entryCam && exitCam && entryCam === exitCam);

  const wsAlive = (ws) =>
    Boolean(ws) && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);

  if (useShared) {
    const ok =
      lotDetailState.streamSharedCamId === entryCam &&
      wsAlive(lotDetailState.sharedWs) &&
      !lotDetailState.entryWs &&
      !lotDetailState.exitWs;
    if (ok) return;
  } else {
    const entryOk = entryCam
      ? lotDetailState.streamEntryCamId === entryCam && wsAlive(lotDetailState.entryWs)
      : !lotDetailState.entryWs;
    const exitOk = exitCam
      ? lotDetailState.streamExitCamId === exitCam && wsAlive(lotDetailState.exitWs)
      : !lotDetailState.exitWs;
    if (entryOk && exitOk && !lotDetailState.sharedWs) return;
  }

  closeLotDetailStreams();
  if (useShared) {
    openSharedLotStream(entryCam);
    lotDetailState.streamSharedCamId = entryCam;
  } else {
    openLotStream('entry', entryCam);
    openLotStream('exit', exitCam);
    lotDetailState.streamEntryCamId = entryCam;
    lotDetailState.streamExitCamId = exitCam;
  }
}

function renderLotDetailLogs(sessions) {
  els.lotDetailLogBody.innerHTML = '';
  const rows = [];
  for (const s of sessions) {
    rows.push({ at: s.entry_time, direction: 'in', plate: s.plate || '-', card: s.rfid_card, status: 'checked_in' });
    if (s.exit_time) {
      rows.push({ at: s.exit_time, direction: 'out', plate: s.plate || '-', card: s.rfid_card, status: 'checked_out' });
    }
  }
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (!rows.length) {
    els.lotDetailLogBody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có log in/out cho bãi này</td></tr>';
    return;
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const tr = document.createElement('tr');
    const directionLabel = row.direction === 'in' ? 'IN' : 'OUT';
    const statusLabel = row.status === 'checked_in' ? 'Đang gửi' : 'Đã ra';
    tr.className = `lot-log-row ${idx % 2 === 0 ? 'lot-log-even' : 'lot-log-odd'}`;
    tr.innerHTML = `
      <td>${fmtDate(row.at)}</td>
      <td><span class="lot-log-chip ${row.direction === 'in' ? 'lot-log-chip-in' : 'lot-log-chip-out'}">${directionLabel}</span></td>
      <td>${row.plate}</td>
      <td>${row.card}</td>
      <td><span class="lot-log-chip ${row.status === 'checked_in' ? 'lot-log-chip-in' : 'lot-log-chip-out'}">${statusLabel}</span></td>
    `;
    els.lotDetailLogBody.appendChild(tr);
  }
}

function setCaptureStatusChip(el, ok, label) {
  if (!el) return;
  el.classList.remove('is-ok', 'is-off');
  el.classList.add(ok ? 'is-ok' : 'is-off');
  el.textContent = `${label}: ${ok ? 'quét RFID OK' : 'đang không quét'}`;
}

function pulseCaptureStatus(kind, ok, snapshot = null) {
  const target = kind === 'entry' ? els.lotEntryCaptureStatus : els.lotExitCaptureStatus;
  const label = kind === 'entry' ? 'RFID vào' : 'RFID ra';
  if (!ok) {
    setCaptureStatusChip(target, false, label);
    return;
  }
  const pulseKey = snapshot
    ? `${snapshot.session_id || '-'}:${snapshot.direction || '-'}:${snapshot.timestamp || '-'}:${snapshot.image_url || '-'}`
    : null;
  if (pulseKey && lastCapturePulseKeys[kind] === pulseKey) return;
  if (pulseKey) lastCapturePulseKeys[kind] = pulseKey;
  setCaptureStatusChip(target, true, label);
  if (captureStatusTimers[kind]) clearTimeout(captureStatusTimers[kind]);
  captureStatusTimers[kind] = setTimeout(() => {
    setCaptureStatusChip(target, false, label);
    captureStatusTimers[kind] = null;
  }, 2000);
}

function setCaptureStatusIdle() {
  if (captureStatusTimers.entry) { clearTimeout(captureStatusTimers.entry); captureStatusTimers.entry = null; }
  if (captureStatusTimers.exit) { clearTimeout(captureStatusTimers.exit); captureStatusTimers.exit = null; }
  lastCapturePulseKeys.entry = null;
  lastCapturePulseKeys.exit = null;
  setCaptureStatusChip(els.lotEntryCaptureStatus, false, 'RFID vào');
  setCaptureStatusChip(els.lotExitCaptureStatus, false, 'RFID ra');
}

function renderLotLatestCaptures(snapshots) {
  if (!snapshots || !snapshots.length) {
    els.lotEntryCaptureImg.src = '';
    els.lotExitCaptureImg.src = '';
    setCaptureStatusIdle();
    return;
  }

  const ordered = [...snapshots].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const latest = ordered[0];

  if (latest.direction === 'in') {
    els.lotEntryCaptureImg.src = latest.image_url ? absoluteApiUrlNoCache(latest.image_url) : '';
    els.lotExitCaptureImg.src = '';
    pulseCaptureStatus('entry', Boolean(latest.image_url), latest);
    setCaptureStatusChip(els.lotExitCaptureStatus, false, 'RFID ra');
    return;
  }

  if (latest.direction === 'out') {
    const pairedIn = ordered.find((x) => x.direction === 'in' && x.session_id === latest.session_id);
    els.lotEntryCaptureImg.src = pairedIn?.image_url ? absoluteApiUrlNoCache(pairedIn.image_url) : '';
    els.lotExitCaptureImg.src = latest.image_url ? absoluteApiUrlNoCache(latest.image_url) : '';
    setCaptureStatusChip(els.lotEntryCaptureStatus, false, 'RFID vào');
    pulseCaptureStatus('exit', Boolean(latest.image_url), latest);
    return;
  }

  els.lotEntryCaptureImg.src = '';
  els.lotExitCaptureImg.src = '';
  setCaptureStatusIdle();
}

export async function openParkingLotDetail(lotId) {
  const data = await api(`/api/v1/parking-lots/${lotId}/overview?limit=100`);
  lotDetailState.selectedLotId = lotId;
  els.lotDetailTitle.textContent = `Chi tiết bãi xe: ${data.lot.name} (#${data.lot.id})`;
  els.lotDetailMeta.textContent = `Cam vào: ${cameraNameById(data.lot.entry_camera_id)} | Cam ra: ${cameraNameById(data.lot.exit_camera_id)}`;
  renderLotDetailLogs(data.sessions || []);
  renderLotLatestCaptures(data.snapshots || []);
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
      <td>${lotName}</td>
      <td>${row.direction}</td>
      <td>${row.plate}</td>
      <td>${row.rfid_card}</td>
      <td>${cameraNameById(row.camera_id)}</td>
      <td><a href="${absoluteApiUrl(row.image_url)}" target="_blank" rel="noopener">Xem ảnh</a></td>
    `;
    els.snapshotBody.appendChild(tr);
  }
}

export function initParking(opts = {}) {
  hooks.onLotsLoaded = opts.onLotsLoaded || null;

  els.lotForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = els.lotName.value.trim();
    if (!name) return;
    const editId = els.lotEditId.value ? Number(els.lotEditId.value) : null;
    const method = editId ? 'PUT' : 'POST';
    const path = editId ? `/api/v1/parking-lots/${editId}` : '/api/v1/parking-lots';

    try {
      await api(path, {
        method,
        body: JSON.stringify({
          name,
          capacity: els.lotCapacity && els.lotCapacity.value !== '' ? Number(els.lotCapacity.value) : 50,
          entry_camera_id: els.lotEntryCamera.value ? Number(els.lotEntryCamera.value) : null,
          exit_camera_id: els.lotExitCamera.value ? Number(els.lotExitCamera.value) : null,
          is_active: Boolean(els.lotIsActive.checked),
        }),
      });
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
    closeLotDetailStreams();
    els.lotDetailTitle.textContent = 'Chi tiết bãi xe';
    els.lotDetailMeta.textContent = 'Chọn bãi xe từ danh sách để xem dữ liệu riêng.';
    els.lotDetailLogBody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có dữ liệu</td></tr>';
    els.lotEntryCaptureImg.src = '';
    els.lotExitCaptureImg.src = '';
    setCaptureStatusIdle();
    setLotPlaceholder('entry', 'Chưa có camera vào');
    setLotPlaceholder('exit', 'Chưa có camera ra');
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
